import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { RotaModelo } from '../entities/RotaModelo';
import { Peca } from '../entities/Peca';
import { AuditLog } from '../entities/AuditLog';
import { Usuario } from '../entities/Usuario';
import { ConfigOpcao } from '../entities/ConfigOpcao';

// ═══ Schemas de Validação Zod ═══
const createLoteSchema = z.object({
  modeloId: z.string().uuid({ message: 'modeloId deve ser um UUID válido.' }),
  plantaId: z.string().uuid({ message: 'plantaId deve ser um UUID válido.' }),
  prioridadePcp: z.string().min(1, { message: 'prioridadePcp é obrigatória.' }),
  possuiCaixaTeste: z.boolean().optional().default(false),
  observacoes: z.string().optional().nullable(),
  dataPrevistaProducao: z.string().optional().nullable(),
  slasPorSetor: z.record(z.string(), z.number()).optional().nullable(),
});

const updateLoteSchema = z.object({
  status: z.nativeEnum(OrdemTesteStatus).optional(),
  liberadoProducao: z.boolean().optional(),
  observacoes: z.string().optional().nullable(),
});

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isUuid(val: any): boolean {
  return typeof val === 'string' && uuidRegex.test(val);
}

const updateManutencaoSchema = z.object({
  dataPrevistaProducao: z.string().optional().nullable(),
  slasPorSetor: z.record(z.string(), z.number()).optional().nullable(),
  pecas: z.array(z.object({
    id: z.string(),
    setorCorteOpcaoId: z.string()
  })).optional()
});

export class LotesController {
  /**
   * GET /api/lotes ou /api/ordens-teste
   * Lista todas as ordens de teste cadastradas no sistema.
   */
  public getLotes = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const lotes = await loteRepo.find({
        relations: {
          modelo: { pecas: { setorCorteOpcao: true }, marca: true, rotas: { setor: true } },
          planta: true,
          criadoPor: true
        },
        order: { createdAt: 'DESC' }
      });
      const lotesComSla = lotes.map(l => ({
        ...l,
        slasPorSetor: l.slasPorSetor || null
      }));
      return res.json(lotesComSla);
    } catch (error) {
      console.error('[LotesController] Erro ao buscar ordens de teste:', error);
      return res.status(500).json({ error: 'Erro ao listar ordens de teste' });
    }
  };

  /**
   * GET /api/lotes/:id ou /api/ordens-teste/:id
   * Retorna os detalhes de uma ordem de teste específica.
   */
  public getLoteById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const lote = await loteRepo.findOne({
        where: { id },
        relations: {
          modelo: { pecas: { setorCorteOpcao: true }, marca: true, rotas: { setor: true } },
          planta: true,
          criadoPor: true
        }
      });

      if (!lote) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'LOTE_NOT_FOUND'
        });
      }

      const auditRepo = AppDataSource.getRepository(AuditLog);
      const auditLogs = await auditRepo.find({
        where: { entidadeId: id },
        relations: { usuario: true },
        order: { createdAt: 'DESC' }
      });

      return res.json({
        ...lote,
        slasPorSetor: lote.slasPorSetor || null,
        auditLogs: auditLogs.map(l => ({
          id: l.id,
          acao: l.acao,
          entidadeTipo: l.entidadeTipo,
          dadosAnteriores: l.dadosAnteriores,
          dadosNovos: l.dadosNovos,
          ipAddress: l.ipAddress,
          criadoEm: l.createdAt,
          usuario: l.usuario
            ? {
                id: l.usuario.id,
                nome: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario || 'Sistema',
                nomeCompleto: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario,
                usuario: (l.usuario as any).usuario
              }
            : null
        }))
      });
    } catch (error) {
      console.error('[LotesController] Erro ao buscar ordem de teste:', error);
      return res.status(500).json({ error: 'Erro ao buscar ordem de teste' });
    }
  };

  /**
   * POST /api/lotes ou /api/ordens-teste
   * Cria e persiste uma nova ordem de teste com código de barras dinâmico e status inicial padrão.
   */
  public createLote = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Usuário não autenticado.',
          code: 'AUTH_UNAUTHENTICATED'
        });
      }

      const parseResult = createLoteSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de preenchimento inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const {
        modeloId,
        plantaId,
        prioridadePcp,
        possuiCaixaTeste,
        observacoes,
        dataPrevistaProducao,
        slasPorSetor
      } = parseResult.data;

      const loteRepo = AppDataSource.getRepository(OrdemTeste);

      const ordemExistente = await loteRepo.findOne({ where: { modeloId } });
      if (ordemExistente) {
        return res.status(400).json({
          error: 'Este modelo já possui um teste de produção ativo. A relação Modelo → Ordem de Teste é 1:1.',
          code: 'MODELO_TESTE_DUPLICADO',
          ordemId: ordemExistente.id,
          codigoBarras: ordemExistente.codigoBarras,
        });
      }

      const rotaRepo = AppDataSource.getRepository(RotaModelo);
      const countRotas = await rotaRepo.count({ where: { modeloId } });
      if (countRotas === 0) {
        return res.status(400).json({
          error: 'Falha: O modelo não possui uma rota de produção definida. Acesse o Construtor de Rota para mapear o fluxo do modelo antes de gerar a Ordem.',
          code: 'ROTA_NOT_FOUND'
        });
      }

      const lote = loteRepo.create({
        modeloId,
        plantaId,
        criadoPorId: req.user!.userId,
        codigoBarras: `OT-${Date.now()}`,
        dataInicio: new Date(),
        prioridadePcp,
        status: OrdemTesteStatus.AGUARDANDO_MATERIAL,
        liberadoProducao: false,
        possuiCaixaTeste,
        observacoes: observacoes || null,
        dataPrevistaProducao: dataPrevistaProducao ? new Date(dataPrevistaProducao) : null,
        slasPorSetor: slasPorSetor || null,
      });

      const savedLote = await loteRepo.save(lote);

      return res.status(201).json({
        message: 'Ordem de teste criada com sucesso.',
        lote: savedLote
      });

    } catch (error: any) {
      console.error('[LotesController] Erro ao criar ordem de teste:', error);
      return res.status(400).json({
        error: error.message || 'Erro ao criar ordem de teste.',
        code: 'LOTE_CREATE_FAILED'
      });
    }
  };

  /**
   * PUT /api/lotes/:id ou /api/ordens-teste/:id
   * Atualiza os dados ou status de uma ordem de teste.
   */
  public updateLote = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      
      const parseResult = updateLoteSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      let lote = await loteRepo.findOne({
        where: { id }
      });

      if (!lote) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'LOTE_NOT_FOUND'
        });
      }

      const { status, liberadoProducao, observacoes } = parseResult.data;

      if (status !== undefined) {
        lote.status = status;
      }
      if (liberadoProducao !== undefined) {
        lote.liberadoProducao = liberadoProducao;
      }
      if (observacoes !== undefined) {
        lote.observacoes = observacoes;
      }

      lote = await loteRepo.save(lote);

      return res.json({
        message: 'Ordem de teste atualizada com sucesso.',
        lote
      });

    } catch (error: any) {
      console.error('[LotesController] Erro ao atualizar ordem de teste:', error);
      return res.status(400).json({
        error: error.message || 'Erro ao atualizar ordem de teste.',
        code: 'LOTE_UPDATE_FAILED'
      });
    }
  };

  /**
   * PUT /api/ordens-teste/:id/manutencao ou /api/lotes/:id/manutencao
   * Atualiza datas de SLA e permite remanejamento de máquinas/peças.
   */
  public updateManutencao = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const parseResult = updateManutencaoSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de manutenção inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const pecaRepo = AppDataSource.getRepository(Peca);

      let lote = await loteRepo.findOne({
        where: { id },
        relations: { modelo: { pecas: true, rotas: { setor: true } }, planta: true }
      });

      if (!lote) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'LOTE_NOT_FOUND'
        });
      }

      const { dataPrevistaProducao, pecas } = parseResult.data;

      const reqUser = (req as any).user || (req as any).usuario || {};
      const userPerfil = (reqUser.perfilNome || reqUser.perfil?.nome || reqUser.perfil || '').toString().toUpperCase();

      // Lookup do Usuário Autenticado por Username (SSO Unix)
      let auditUsuarioId: string | null = null;
      try {
        const userRepo = AppDataSource.getRepository(Usuario);
        const usernameToken = reqUser.usuario || reqUser.username || reqUser.nome || reqUser.preferred_username;

        let localUsuario: Usuario | null = null;
        if (usernameToken) {
          const cleanUserStr = String(usernameToken).trim();
          // 1. Busca exata por usuario
          localUsuario = await userRepo.findOne({ where: { usuario: cleanUserStr } });
          if (!localUsuario) {
            // 2. Busca case-insensitive
            localUsuario = await userRepo.createQueryBuilder('u')
              .where('LOWER(u.usuario) = LOWER(:usr)', { usr: cleanUserStr })
              .getOne();
          }
        }
        if (!localUsuario && reqUser.id && isUuid(reqUser.id)) {
          localUsuario = await userRepo.findOne({ where: { id: String(reqUser.id) } });
        }
        if (localUsuario) {
          auditUsuarioId = localUsuario.id;
        }
      } catch (err) {
        console.warn('[updateManutencao] Erro ao realizar lookup de usuário:', err);
      }

      // SLA Efetivo Anterior
      const slasAnterioresEfetivos: Record<string, number> = {};
      if (lote.slasPorSetor && Object.keys(lote.slasPorSetor).length > 0) {
        Object.assign(slasAnterioresEfetivos, lote.slasPorSetor);
      } else {
        const modeloSlaMap = (lote.modelo as any)?.slasPorSetor;
        if (modeloSlaMap && typeof modeloSlaMap === 'object') {
          Object.assign(slasAnterioresEfetivos, modeloSlaMap);
        } else if (Array.isArray(lote.modelo?.rotas)) {
          for (const r of lote.modelo!.rotas!) {
            const key = r.setor?.id || r.setorId || r.setor?.nome;
            if (key) {
              slasAnterioresEfetivos[key] = (r as any).tempoSla || (r as any).tempo_sla || 0;
            }
          }
        }
      }

      const novosSlas = req.body.slasPorSetor !== undefined ? req.body.slasPorSetor : req.body.slas_por_setor;
      const diffAnterior: Record<string, number> = {};
      const diffNovo: Record<string, number> = {};

      if (novosSlas !== undefined && typeof novosSlas === 'object' && novosSlas !== null) {
        const isAllowedRole = userPerfil === 'MODELISTA' || userPerfil === 'ADMIN';

        const allKeys = Array.from(new Set([...Object.keys(slasAnterioresEfetivos), ...Object.keys(novosSlas)]));
        for (const key of allKeys) {
          if (key === 'default') continue;
          const vAnt = slasAnterioresEfetivos[key] !== undefined ? Number(slasAnterioresEfetivos[key]) : 0;
          const vNov = novosSlas[key] !== undefined ? Number(novosSlas[key]) : 0;

          if (vAnt !== vNov) {
            diffAnterior[key] = vAnt;
            diffNovo[key] = vNov;
          }
        }

        const mudouSlaReal = Object.keys(diffNovo).length > 0;

        if (mudouSlaReal && !isAllowedRole) {
          return res.status(403).json({
            error: 'Acesso Negado: Apenas Modelistas e Administradores podem alterar os prazos (SLA) de produção.',
            code: 'FORBIDDEN_SLA_EDIT'
          });
        }

        if (mudouSlaReal) {
          lote.slasPorSetor = novosSlas;
        }
      }

      if (dataPrevistaProducao !== undefined) {
        lote.dataPrevistaProducao = dataPrevistaProducao ? new Date(dataPrevistaProducao) : null;
      }

      await loteRepo.save(lote);

      // Trava Antispam: Auditoria ISO de Alteração de SLA — Grava apenas se houver diff real
      if (Object.keys(diffNovo).length > 0) {
        try {
          const auditLogRepository = AppDataSource.getRepository(AuditLog);
          const logSla = auditLogRepository.create({
            usuarioId: auditUsuarioId,
            acao: 'SLA_ALTERADO',
            entidadeTipo: 'ordens_teste',
            entidadeId: lote.id,
            dadosAnteriores: diffAnterior as any,
            dadosNovos: diffNovo as any,
            ipAddress: req.ip || req.socket.remoteAddress || null
          });
          await auditLogRepository.save(logSla);
        } catch (auditError: any) {
          console.error('[Auditoria ISO] Erro ao salvar log de alteração de SLA:', auditError);
        }
      }

      // Remanejamento de Peças de Corte com Rastreabilidade ISO
      if (pecas && pecas.length > 0) {
        const auditLogRepository = AppDataSource.getRepository(AuditLog);
        const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);

        for (const p of pecas) {
          if (p.id && isUuid(p.id) && p.setorCorteOpcaoId && isUuid(p.setorCorteOpcaoId)) {
            const pecaExistente = await pecaRepo.findOne({
              where: { id: p.id },
              relations: { setorCorteOpcao: true }
            });

            if (pecaExistente && pecaExistente.setorCorteOpcaoId !== p.setorCorteOpcaoId) {
              const antigoId = pecaExistente.setorCorteOpcaoId;
              const antigaMaquina = pecaExistente.setorCorteOpcao?.valor || pecaExistente.setorCorteOpcao?.label || 'Sem máquina';

              const novaOpcao = await configOpcaoRepo.findOne({ where: { id: p.setorCorteOpcaoId } });
              const novaMaquina = novaOpcao?.valor || novaOpcao?.label || p.setorCorteOpcaoId;

              pecaExistente.setorCorteOpcaoId = p.setorCorteOpcaoId;
              await pecaRepo.save(pecaExistente);

              try {
                const log = auditLogRepository.create({
                  usuarioId: auditUsuarioId,
                  acao: 'PECA_REMANEJADA',
                  entidadeTipo: 'ordens_teste',
                  entidadeId: lote.id,
                  dadosAnteriores: {
                    pecaId: pecaExistente.id,
                    pecaNome: pecaExistente.nome,
                    maquinaId: antigoId,
                    maquinaNome: antigaMaquina
                  },
                  dadosNovos: {
                    pecaId: pecaExistente.id,
                    pecaNome: pecaExistente.nome,
                    maquinaId: p.setorCorteOpcaoId,
                    maquinaNome: novaMaquina
                  },
                  ipAddress: req.ip || req.socket.remoteAddress || null
                });
                await auditLogRepository.save(log);
              } catch (auditError: any) {
                console.error('[Auditoria ISO] Erro ao salvar log de remanejamento:', auditError);
              }
            }
          }
        }
      }

      const loteAtualizado = await loteRepo.findOne({
        where: { id },
        relations: { modelo: { pecas: true, marca: true, rotas: { setor: true } }, planta: true, criadoPor: true }
      });

      const auditRepo = AppDataSource.getRepository(AuditLog);
      const auditLogs = await auditRepo.find({
        where: { entidadeId: id },
        relations: { usuario: true },
        order: { createdAt: 'DESC' }
      });

      return res.json({
        message: 'Manutenção da Ordem realizada com sucesso.',
        lote: loteAtualizado ? {
          ...loteAtualizado,
          slasPorSetor: loteAtualizado.slasPorSetor || null,
          auditLogs: auditLogs.map(l => ({
            id: l.id,
            acao: l.acao,
            entidadeTipo: l.entidadeTipo,
            dadosAnteriores: l.dadosAnteriores,
            dadosNovos: l.dadosNovos,
            ipAddress: l.ipAddress,
            criadoEm: l.createdAt,
            usuario: l.usuario
              ? {
                  id: l.usuario.id,
                  nome: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario || 'Sistema',
                  nomeCompleto: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario,
                  usuario: (l.usuario as any).usuario
                }
              : null
          }))
        } : null
      });

    } catch (error: any) {
      console.error('[LotesController.updateManutencao] Erro:', error);
      return res.status(500).json({
        error: error.message || 'Erro ao realizar manutenção da ordem.',
        code: 'MANUTENCAO_FAILED'
      });
    }
  };

  /**
   * GET /api/lotes/:id/auditoria
   * Retorna o histórico de auditoria ISO de uma ordem de teste.
   */
  public getAuditoria = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const auditRepo = AppDataSource.getRepository(AuditLog);
      const logs = await auditRepo.find({
        where: { entidadeId: String(id) },
        relations: { usuario: true },
        order: { createdAt: 'DESC' },
      });

      const result = logs.map(l => ({
        id: l.id,
        acao: l.acao,
        entidadeTipo: l.entidadeTipo,
        dadosAnteriores: l.dadosAnteriores,
        dadosNovos: l.dadosNovos,
        ipAddress: l.ipAddress,
        criadoEm: l.createdAt,
        usuario: l.usuario
          ? {
              id: l.usuario.id,
              nome: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario || 'Sistema',
              nomeCompleto: (l.usuario as any).nomeCompleto || (l.usuario as any).nome || (l.usuario as any).usuario,
              usuario: (l.usuario as any).usuario
            }
          : null,
      }));

      return res.json(result);
    } catch (error: any) {
      console.error('[LotesController.getAuditoria] Erro:', error);
      return res.status(500).json({
        error: error.message || 'Erro ao buscar histórico de auditoria.',
        code: 'AUDITORIA_FETCH_FAILED'
      });
    }
  };
}
