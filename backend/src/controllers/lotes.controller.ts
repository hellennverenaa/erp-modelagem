import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { RotaModelo } from '../entities/RotaModelo';
import { Peca } from '../entities/Peca';
import { Modelo } from '../entities/Modelo';
import { Planta } from '../entities/Planta';
import { AuditLog } from '../entities/AuditLog';
import { Usuario } from '../entities/Usuario';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { perfilPossuiPermissao } from '../services/rbac.service';
import { finalizarNovoTeste, NovoTesteServiceError } from '../services/novo-teste.service';
import { getPersistedModelRoute, lockModelConfiguration, RouteIntegrityError, validatePersistedModelRoute } from '../services/route-integrity.service';
import { finalizarNovoTesteSchema } from '../schemas/novo-teste.schema';
import { ModelPieceInput, ModelPiecesError, saveModelPieces } from '../services/model-pieces.service';

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

const criarOrdemPcpSchema = z.object({
  modeloId: z.string().uuid(),
  plantaId: z.string().uuid(),
  prioridadePcp: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
  dataCorte: z.string().nullable().optional().refine(
    (value) => value == null || Number.isFinite(new Date(value).getTime()),
    'Previsão de corte inválida.',
  ),
  dataPrevistaProducao: z.string().nullable().optional().refine(
    (value) => value == null || Number.isFinite(new Date(value).getTime()),
    'Data prevista de início na produção inválida.',
  ),
  observacoes: z.string().trim().nullable().optional(),
});

const salvarConfiguracaoPecasSchema = z.object({
  possuiCaixaTeste: z.boolean(),
  pecas: z.array(z.object({
    id: z.string().uuid().optional(),
    catalogoPecaId: z.string().uuid(),
    setorCorteOpcaoId: z.string().uuid(),
  })).min(2),
});

const finalizarModelagemSchema = z.object({
  slasPorSetor: z.record(z.string(), z.number().nonnegative()).optional().nullable(),
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

function possuiAcessoTodasPlantas(req: Request): Promise<boolean> {
  return req.user ? perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS') : Promise.resolve(false);
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
  /** Cria ordem PCP antes da configuração da Modelagem. */
  public criarOrdemPcp = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
    const parsed = criarOrdemPcpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos para criar a ordem.', code: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors });
    }

    const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
    if (!acessoTodasPlantas && parsed.data.plantaId !== req.user.plantaId) {
      return res.status(403).json({ error: 'Não é permitido criar uma ordem em outra planta.', code: 'PLANTA_FORBIDDEN' });
    }

    try {
      const ordem = await AppDataSource.transaction(async (manager) => {
        await lockModelConfiguration(manager, parsed.data.modeloId);
        const modeloRepo = manager.getRepository(Modelo);
        const modelo = await modeloRepo.findOne({ where: { id: parsed.data.modeloId, ativo: true } });
        if (!modelo) throw Object.assign(new Error('Modelo não encontrado ou inativo.'), { status: 404, code: 'MODELO_NOT_FOUND' });

        const ordemExistente = await manager.getRepository(OrdemTeste).findOne({ where: { modeloId: modelo.id } });
        if (ordemExistente) throw Object.assign(new Error('Este modelo já possui uma ordem de teste. A relação Modelo → Ordem de Teste é 1:1.'), { status: 409, code: 'MODELO_TESTE_DUPLICADO', ordemId: ordemExistente.id, codigoBarras: ordemExistente.codigoBarras });

        const planta = await manager.getRepository(Planta).findOne({ where: { id: parsed.data.plantaId, ativo: true }, select: { id: true } });
        if (!planta) throw Object.assign(new Error('Planta não encontrada ou inativa.'), { status: 404, code: 'PLANTA_NOT_FOUND' });
        const previsaoCorte = parsed.data.dataCorte ? new Date(parsed.data.dataCorte) : modelo.dataCorte;
        if (!previsaoCorte) throw Object.assign(new Error('Informe a previsão de corte antes de criar a ordem.'), { status: 400, code: 'DATA_CORTE_REQUIRED' });
        if (parsed.data.dataCorte) {
          modelo.dataCorte = previsaoCorte;
          await modeloRepo.save(modelo);
        }

        const repo = manager.getRepository(OrdemTeste);
        return repo.save(repo.create({
          modeloId: modelo.id,
          plantaId: parsed.data.plantaId,
          criadoPorId: req.user!.userId,
          codigoBarras: `OT-${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`,
          dataInicio: new Date(),
          prioridadePcp: parsed.data.prioridadePcp,
          dataPrevistaProducao: parsed.data.dataPrevistaProducao ? new Date(parsed.data.dataPrevistaProducao) : null,
          observacoes: parsed.data.observacoes?.trim() || null,
          status: OrdemTesteStatus.AGUARDANDO_MODELAGEM,
          liberadoProducao: false,
          possuiCaixaTeste: null,
          rotaSnapshot: null,
          rotaVersao: null,
          slasPorSetor: null,
        }));
      });
      return res.status(201).json({ message: 'Ordem criada e enviada para a fila da Modelagem.', ordem, lote: ordem });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Já existe uma ordem de teste para este modelo.', code: 'MODELO_TESTE_DUPLICADO' });
      }
      if (error?.code && error?.status) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...(error.ordemId ? { ordemId: error.ordemId, codigoBarras: error.codigoBarras } : {}) });
      }
      console.error('[LotesController] Erro ao criar ordem do PCP:', error);
      return res.status(500).json({ error: 'Erro ao criar a ordem do PCP.', code: 'PCP_ORDER_CREATE_FAILED' });
    }
  };

  /** Persiste peças e decisão de Caixa Teste mantendo a ordem bloqueada para produção. */
  public salvarConfiguracaoPecasModelagem = async (req: Request, res: Response): Promise<Response> => {
    const id = z.string().uuid().safeParse(req.params.id);
    const parsed = salvarConfiguracaoPecasSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Informe peças, sub-setores e decisão de Caixa Teste válidos.', code: 'VALIDATION_ERROR', details: parsed.success ? undefined : parsed.error.flatten().fieldErrors });
    }
    const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
    if (!acessoTodasPlantas && !req.user?.plantaId) return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });

    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(OrdemTeste);
        const where = acessoTodasPlantas ? { id: id.data } : { id: id.data, plantaId: req.user!.plantaId };
        const encontrada = await repo.findOne({ where, select: { id: true, modeloId: true } });
        if (!encontrada) throw Object.assign(new Error('Ordem de teste não encontrada.'), { status: 404, code: 'LOTE_NOT_FOUND' });
        await lockModelConfiguration(manager, encontrada.modeloId);
        const ordem = await repo.findOne({ where });
        if (!ordem) throw Object.assign(new Error('Ordem de teste não encontrada.'), { status: 404, code: 'LOTE_NOT_FOUND' });
        if (ordem.status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
          throw Object.assign(new Error('A configuração da Modelagem só pode ser alterada enquanto a ordem estiver aguardando modelagem.'), { status: 409, code: 'MODELAGEM_ALREADY_COMPLETED' });
        }
        const pecas = await saveModelPieces(manager, ordem.modeloId, parsed.data.pecas as ModelPieceInput[]);
        ordem.possuiCaixaTeste = parsed.data.possuiCaixaTeste;
        await repo.save(ordem);
        return { ordem, pecas };
      });
      return res.json({ message: 'Peças e decisão de Caixa Teste salvas.', ordem: result.ordem, pecas: result.pecas, totalPecas: result.pecas.length });
    } catch (error: any) {
      if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
      if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[LotesController] Erro ao salvar configuração de peças da Modelagem:', error);
      return res.status(500).json({ error: 'Erro ao salvar as peças da Modelagem.', code: 'MODELAGEM_PIECES_SAVE_FAILED' });
    }
  };

  /** Fecha a configuração, congela a versão da rota na ordem e libera a produção. */
  public finalizarConfiguracaoModelagem = async (req: Request, res: Response): Promise<Response> => {
    const id = z.string().uuid().safeParse(req.params.id);
    const parsed = finalizarModelagemSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos para finalizar a configuração da Modelagem.', code: 'VALIDATION_ERROR' });
    }
    const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
    if (!acessoTodasPlantas && !req.user?.plantaId) return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });

    try {
      const ordem = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(OrdemTeste);
        const where = acessoTodasPlantas ? { id: id.data } : { id: id.data, plantaId: req.user!.plantaId };
        const encontrada = await repo.findOne({ where, select: { id: true, modeloId: true } });
        if (!encontrada) throw Object.assign(new Error('Ordem de teste não encontrada.'), { status: 404, code: 'LOTE_NOT_FOUND' });
        await lockModelConfiguration(manager, encontrada.modeloId);
        const atual = await repo.findOne({ where });
        if (!atual) throw Object.assign(new Error('Ordem de teste não encontrada.'), { status: 404, code: 'LOTE_NOT_FOUND' });
        if (atual.status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
          throw Object.assign(new Error('A ordem não está aguardando configuração da Modelagem.'), { status: 409, code: 'MODELAGEM_ALREADY_COMPLETED' });
        }
        if (atual.possuiCaixaTeste === null) {
          throw Object.assign(new Error('Defina se o modelo possui Caixa Teste antes de finalizar.'), { status: 400, code: 'CAIXA_TESTE_NOT_DEFINED' });
        }

        await validatePersistedModelRoute(manager, atual.modeloId, atual.plantaId);
        const { versao, etapas } = await getPersistedModelRoute(manager, atual.modeloId, atual.plantaId);
        const slasPorSetor = parsed.data.slasPorSetor || {};

        atual.rotaVersao = versao;
        atual.rotaSnapshot = {
          versao,
          plantaId: atual.plantaId,
          etapas: etapas.map((etapa) => ({
            setorId: etapa.setorId,
            nome: etapa.setor?.nome || 'Setor',
            ordem: etapa.ordem,
            obrigatorio: etapa.obrigatorio,
            tipoExecucao: etapa.tipoExecucao,
            bipagemApenasSaida: etapa.bipagemApenasSaida,
          })),
          slasPorSetor,
        };
        atual.slasPorSetor = slasPorSetor;
        atual.status = OrdemTesteStatus.AGUARDANDO_MATERIAL;
        atual.liberadoProducao = true;
        return repo.save(atual);
      });
      return res.json({ message: 'Modelagem concluída. A ordem foi liberada para produção.', ordem });
    } catch (error: any) {
      if (error instanceof RouteIntegrityError) return res.status(400).json({ error: error.message, code: error.code });
      if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[LotesController] Erro ao finalizar configuração da Modelagem:', error);
      return res.status(500).json({ error: 'Erro ao finalizar a configuração da Modelagem.', code: 'MODELAGEM_FINALIZE_FAILED' });
    }
  };

  /**
   * GET /api/lotes ou /api/ordens-teste
   * Lista todas as ordens de teste cadastradas no sistema.
   */
  public getLotes = async (req: Request, res: Response): Promise<Response> => {
    try {
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }

      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const lotes = await loteRepo.find({
        where: acessoTodasPlantas ? undefined : { plantaId: req.user!.plantaId },
        relations: {
          modelo: { pecas: { setorCorteOpcao: true }, marca: true, rotas: { setor: true } },
          planta: true,
          criadoPor: true,
          rastreamentos: { setor: true, estacao: true, operadorEntrada: true, operadorSaida: true }
        },
        order: { createdAt: 'DESC' }
      });
      const lotesComSla = lotes.map(l => {
        if (l.modelo?.rotas) {
          const rotasDaPlanta = l.modelo.rotas.filter((rota) => rota.plantaId === l.plantaId);
          const versao = l.rotaVersao ?? rotasDaPlanta.reduce((maior, rota) => Math.max(maior, rota.versao || 1), 0);
          l.modelo.rotas = rotasDaPlanta.filter((rota) => (rota.versao || 1) === versao);
        }
        return { ...l, slasPorSetor: l.slasPorSetor || null };
      });
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
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }
      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const lote = await loteRepo.findOne({
        where: acessoTodasPlantas ? { id } : { id, plantaId: req.user!.plantaId },
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

      if (lote.modelo?.rotas) {
        const rotasDaPlanta = lote.modelo.rotas.filter((rota) => rota.plantaId === lote.plantaId);
        const versao = lote.rotaVersao ?? rotasDaPlanta.reduce((maior, rota) => Math.max(maior, rota.versao || 1), 0);
        lote.modelo.rotas = rotasDaPlanta.filter((rota) => (rota.versao || 1) === versao);
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
   * POST /api/ordens-teste/wizard
   * Persiste o agregado do wizard em uma única transação.
   */
  public finalizarWizard = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
    }

    const parseResult = finalizarNovoTesteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados inválidos para finalizar o novo teste.',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { plantaId } = parseResult.data.ordem;
    const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
    if (!acessoTodasPlantas && plantaId !== req.user.plantaId) {
      return res.status(403).json({
        error: 'Não é permitido criar uma ordem em outra planta.',
        code: 'PLANTA_FORBIDDEN',
      });
    }

    try {
      const resultado = await finalizarNovoTeste(parseResult.data, req.user.userId);
      return res.status(201).json({
        message: 'Novo teste finalizado com sucesso.',
        modelo: resultado.modelo,
        lote: resultado.ordem,
        totalPecas: resultado.totalPecas,
        totalEtapasRota: resultado.totalEtapasRota,
      });
    } catch (error) {
      if (error instanceof RouteIntegrityError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      if (error instanceof NovoTesteServiceError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      console.error('[LotesController] Erro ao finalizar wizard:', error);
      return res.status(500).json({
        error: 'Erro ao finalizar o novo teste. Nenhuma etapa foi confirmada.',
        code: 'NEW_TEST_FINALIZATION_FAILED',
      });
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

      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);

      if (!acessoTodasPlantas && plantaId !== req.user.plantaId) {
        return res.status(403).json({
          error: 'Não é permitido criar uma ordem em outra planta.',
          code: 'PLANTA_FORBIDDEN'
        });
      }

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
      const countRotas = await rotaRepo.count({ where: { modeloId, plantaId } });
      if (countRotas === 0) {
        return res.status(400).json({
          error: 'Falha: O modelo não possui uma rota de produção definida. Acesse o Construtor de Rota para mapear o fluxo do modelo antes de gerar a Ordem.',
          code: 'ROTA_NOT_FOUND'
        });
      }
      await validatePersistedModelRoute(AppDataSource.manager, modeloId, plantaId);

      const lote = loteRepo.create({
        modeloId,
        plantaId: acessoTodasPlantas ? plantaId : req.user.plantaId,
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
      if (error instanceof RouteIntegrityError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
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
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }
      let lote = await loteRepo.findOne({
        where: acessoTodasPlantas ? { id } : { id, plantaId: req.user!.plantaId }
      });

      if (!lote) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'LOTE_NOT_FOUND'
        });
      }

      const { status, liberadoProducao, observacoes } = parseResult.data;

      if (lote.status === OrdemTesteStatus.AGUARDANDO_MODELAGEM && status !== undefined && status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
        return res.status(409).json({
          error: 'A ordem só pode sair de Aguardando Modelagem após concluir a configuração de peças, Caixa Teste e rota.',
          code: 'MODELAGEM_REQUIRED',
        });
      }
      if (lote.status === OrdemTesteStatus.AGUARDANDO_MODELAGEM && liberadoProducao === true) {
        return res.status(409).json({
          error: 'A liberação é concluída somente pelo fluxo de finalização da Modelagem.',
          code: 'MODELAGEM_REQUIRED',
        });
      }
      if (status === OrdemTesteStatus.AGUARDANDO_MODELAGEM && lote.status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
        return res.status(409).json({ error: 'O estado Aguardando Modelagem é controlado pelo fluxo de configuração.', code: 'MODELAGEM_STATUS_MANAGED' });
      }
      if (liberadoProducao === true || (status !== undefined && status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM)) {
        if (lote.possuiCaixaTeste === null) {
          return res.status(409).json({ error: 'A Modelagem precisa definir Caixa Teste antes de avançar o estado da ordem.', code: 'CAIXA_TESTE_NOT_DEFINED' });
        }
        try {
          await validatePersistedModelRoute(AppDataSource.manager, lote.modeloId, lote.plantaId, lote.rotaVersao);
        } catch (error) {
          if (error instanceof RouteIntegrityError) {
            return res.status(409).json({ error: `A ordem não pode avançar sem uma rota válida: ${error.message}`, code: 'ROTA_INVALIDA' });
          }
          throw error;
        }
      }

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
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }

      let lote = await loteRepo.findOne({
        where: acessoTodasPlantas ? { id } : { id, plantaId: req.user!.plantaId },
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
          for (const r of lote.modelo!.rotas!.filter((rota) => rota.plantaId === lote!.plantaId)) {
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
        const podeEditarRota = await perfilPossuiPermissao(req.user!.perfilId, 'EDITAR_ROTA');

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

        if (mudouSlaReal && !podeEditarRota) {
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
      if (loteAtualizado?.modelo?.rotas) {
        loteAtualizado.modelo.rotas = loteAtualizado.modelo.rotas.filter((rota) => rota.plantaId === loteAtualizado.plantaId);
      }

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
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }
      if (!acessoTodasPlantas) {
        const lote = await AppDataSource.getRepository(OrdemTeste).findOne({
          where: { id: String(id), plantaId: req.user!.plantaId },
          select: { id: true }
        });
        if (!lote) {
          return res.status(404).json({ error: 'Ordem de teste não encontrada.', code: 'LOTE_NOT_FOUND' });
        }
      }

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
