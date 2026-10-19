import { Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { RotaModelo } from '../entities/RotaModelo';
import { Peca } from '../entities/Peca';
import { AuditLog } from '../entities/AuditLog';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Setor } from '../entities/Setor';
import { perfilPossuiPermissao } from '../services/rbac.service';
import { finalizarNovoTeste, NovoTesteServiceError } from '../services/novo-teste.service';
import { getPersistedModelRoute, lockModelConfiguration, RouteIntegrityError, validatePersistedModelRoute } from '../services/route-integrity.service';
import { finalizarNovoTesteSchema } from '../schemas/novo-teste.schema';
import { ModelPiecesError } from '../services/model-pieces.service';
import { getSetorCorteOpcaoEfetiva, mapearSubsetoresParaTiposDeSetor } from '../services/ordem-pecas.service';
import { garantirTicketsSetorDaOrdem } from '../services/ticket-setor.service';
import { LoteService, LoteServiceError } from '../services/lote.service';
import { TicketService, TicketServiceError } from '../services/ticket.service';

// ═══ Schemas de Validação Zod ═══
const createLoteSchema = z.object({
  modeloId: z.string().uuid({ message: 'modeloId deve ser um UUID válido.' }),
  plantaId: z.string().uuid({ message: 'plantaId deve ser um UUID válido.' }),
  prioridadePcp: z.string().min(1, { message: 'prioridadePcp é obrigatória.' }),
  possuiCaixaTeste: z.boolean().optional().default(false),
  observacoes: z.string().optional().nullable(),
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
  slasPorSetor: z.record(z.string(), z.number().nonnegative()).optional().nullable(),
  pecas: z.array(z.object({
    id: z.string().uuid(),
    setorCorteOpcaoId: z.string().uuid()
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

    try {
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      const ordem = await LoteService.criarOrdemPcp(
        parsed.data,
        { userId: req.user.userId, perfilId: req.user.perfilId, plantaId: req.user.plantaId },
        acessoTodasPlantas
      );
      return res.status(201).json({ message: 'Ordem criada e enviada para a fila da Modelagem.', ordem, lote: ordem });
    } catch (error: any) {
      if (error instanceof LoteServiceError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          ...error.extra
        });
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

    try {
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      const result = await LoteService.salvarConfiguracaoPecasModelagem(
        id.data,
        parsed.data,
        req.user?.plantaId,
        acessoTodasPlantas
      );
      return res.json({ message: 'Peças e decisão de Caixa Teste salvas.', ordem: result.ordem, pecas: result.pecas, totalPecas: result.pecas.length });
    } catch (error: any) {
      if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
      if (error instanceof LoteServiceError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
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

    try {
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      const ordem = await LoteService.finalizarConfiguracaoModelagem(
        id.data,
        parsed.data,
        req.user?.plantaId,
        acessoTodasPlantas
      );
      return res.json({ message: 'Modelagem concluída. A ordem foi liberada para produção.', ordem });
    } catch (error: any) {
      if (error instanceof RouteIntegrityError) return res.status(400).json({ error: error.message, code: error.code });
      if (error instanceof LoteServiceError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
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

      const page = req.query.page ? Math.max(1, Number(req.query.page) || 1) : undefined;
      const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit) || 20)) : undefined;
      const statusFiltro = req.query.status as OrdemTesteStatus | undefined;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

      const loteRepo = AppDataSource.getRepository(OrdemTeste);
      const queryBuilder = loteRepo.createQueryBuilder('ordem')
        .leftJoinAndSelect('ordem.modelo', 'modelo')
        .leftJoinAndSelect('modelo.pecas', 'pecas')
        .leftJoinAndSelect('pecas.setorCorteOpcao', 'setorCorteOpcao')
        .leftJoinAndSelect('modelo.marca', 'marca')
        .leftJoinAndSelect('modelo.rotas', 'rotas')
        .leftJoinAndSelect('rotas.setor', 'rotaSetor')
        .leftJoinAndSelect('ordem.planta', 'planta')
        .leftJoinAndSelect('ordem.criadoPor', 'criadoPor')
        .leftJoinAndSelect('ordem.rastreamentos', 'rastreamentos')
        .leftJoinAndSelect('rastreamentos.setor', 'rastrSetor')
        .leftJoinAndSelect('rastreamentos.estacao', 'rastrEstacao')
        .leftJoinAndSelect('rastreamentos.operadorEntrada', 'operadorEntrada')
        .leftJoinAndSelect('rastreamentos.operadorSaida', 'operadorSaida');

      if (!acessoTodasPlantas && req.user?.plantaId) {
        queryBuilder.andWhere('ordem.plantaId = :plantaId', { plantaId: req.user.plantaId });
      }

      if (statusFiltro && Object.values(OrdemTesteStatus).includes(statusFiltro)) {
        queryBuilder.andWhere('ordem.status = :status', { status: statusFiltro });
      }

      if (q) {
        queryBuilder.andWhere(
          '(LOWER(ordem.codigoBarras) LIKE LOWER(:q) OR LOWER(modelo.nome) LIKE LOWER(:q) OR LOWER(modelo.codigoProduto) LIKE LOWER(:q))',
          { q: `%${q}%` }
        );
      }

      queryBuilder.orderBy('ordem.createdAt', 'DESC');

      let lotes: OrdemTeste[];
      let total = 0;

      if (page !== undefined || limit !== undefined) {
        const take = limit || 20;
        const skip = ((page || 1) - 1) * take;
        const [items, count] = await queryBuilder.skip(skip).take(take).getManyAndCount();
        lotes = items;
        total = count;
      } else {
        lotes = await queryBuilder.getMany();
        total = lotes.length;
      }

      const lotesComSla = lotes.map(l => {
        if (l.modelo?.rotas) {
          const rotasDaPlanta = l.modelo.rotas.filter((rota) => rota.plantaId === l.plantaId);
          const versao = l.rotaVersao ?? rotasDaPlanta.reduce((maior, rota) => Math.max(maior, rota.versao || 1), 0);
          l.modelo.rotas = rotasDaPlanta.filter((rota) => (rota.versao || 1) === versao);
        }
        return { ...l, slasPorSetor: l.slasPorSetor || null };
      });

      res.setHeader('X-Total-Count', total);

      if (page !== undefined || limit !== undefined) {
        const take = limit || 20;
        return res.json({
          data: lotesComSla,
          total,
          page: page || 1,
          limit: take,
          totalPages: Math.ceil(total / take)
        });
      }

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
   * GET /api/lotes/:id/tickets-setor
   * Lista os tickets gerados para a rota congelada de uma ordem.
   */
  public getTicketsSetor = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      const resultado = await TicketService.obterTicketsOrdem(id, req.user?.plantaId, acessoTodasPlantas);
      return res.json(resultado);
    } catch (error: any) {
      if (error instanceof TicketServiceError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[LotesController] Erro ao buscar tickets por setor:', error);
      return res.status(500).json({ error: 'Erro ao buscar tickets por setor.' });
    }
  };

  /** Resolve o código de barras de um ticket e retorna seu fluxo e setor. */
  public getTicketSetorPorCodigo = async (req: Request, res: Response): Promise<Response> => {
    try {
      const codigoBarras = String(req.params.codigoBarras || '');
      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      const resultado = await TicketService.obterTicketPorCodigo(codigoBarras, req.user?.plantaId, acessoTodasPlantas);
      return res.json({ ticket: resultado });
    } catch (error: any) {
      if (error instanceof TicketServiceError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[LotesController] Erro ao resolver ticket por código:', error);
      return res.status(500).json({ error: 'Erro ao localizar o ticket de setor.' });
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
        slasPorSetor
      } = parseResult.data;

      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);

      if (!acessoTodasPlantas && plantaId !== req.user.plantaId) {
        return res.status(403).json({
          error: 'Não é permitido criar uma ordem em outra planta.',
          code: 'PLANTA_FORBIDDEN'
        });
      }

      const savedLote = await AppDataSource.transaction(async (manager) => {
        await lockModelConfiguration(manager, modeloId);
        const loteRepo = manager.getRepository(OrdemTeste);
        const ordemExistente = await loteRepo.findOne({ where: { modeloId } });
        if (ordemExistente) {
          throw Object.assign(
            new Error('Este modelo já possui um teste de produção ativo. A relação Modelo → Ordem de Teste é 1:1.'),
            { status: 400, code: 'MODELO_TESTE_DUPLICADO', ordemId: ordemExistente.id, codigoBarras: ordemExistente.codigoBarras },
          );
        }

        const rotaRepo = manager.getRepository(RotaModelo);
        const countRotas = await rotaRepo.count({ where: { modeloId, plantaId } });
        if (countRotas === 0) {
          throw Object.assign(
            new Error('Falha: O modelo não possui uma rota de produção definida. Acesse o Construtor de Rota para mapear o fluxo do modelo antes de gerar a Ordem.'),
            { status: 400, code: 'ROTA_NOT_FOUND' },
          );
        }
        await validatePersistedModelRoute(manager, modeloId, plantaId);
        const { versao, etapas } = await getPersistedModelRoute(manager, modeloId, plantaId);
        const slasDaRota = Object.fromEntries(etapas.map((etapa) => [etapa.setorId, etapa.slaAlvoMin]));
        const slasDaOrdem = { ...slasDaRota, ...(slasPorSetor || {}) };
        const rotaSnapshot = {
          versao,
          plantaId,
          etapas: etapas.map((etapa) => ({
            setorId: etapa.setorId,
            nome: etapa.setor?.nome || 'Setor',
            ordem: etapa.ordem,
            obrigatorio: etapa.obrigatorio,
            tipoExecucao: etapa.tipoExecucao,
            bipagemApenasSaida: etapa.bipagemApenasSaida,
          })),
          slasPorSetor: slasDaOrdem,
        };

        const lote = loteRepo.create({
          modeloId,
          plantaId: acessoTodasPlantas ? plantaId : req.user!.plantaId,
          criadoPorId: req.user!.userId,
          codigoBarras: `OT-${Date.now()}`,
          dataInicio: new Date(),
          prioridadePcp,
          status: OrdemTesteStatus.AGUARDANDO_MATERIAL,
          liberadoProducao: false,
          possuiCaixaTeste,
          observacoes: observacoes || null,
          slasPorSetor: slasDaOrdem,
          rotaVersao: versao,
          rotaSnapshot,
        });

        const ordemSalva = await loteRepo.save(lote);
        await garantirTicketsSetorDaOrdem(manager, ordemSalva);
        return ordemSalva;
      });

      return res.status(201).json({
        message: 'Ordem de teste criada com sucesso.',
        lote: savedLote
      });

    } catch (error: any) {
      if (error?.status && error?.code) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...(error.ordemId ? { ordemId: error.ordemId, codigoBarras: error.codigoBarras } : {}),
        });
      }
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
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const slasInput = body.slasPorSetor !== undefined ? body.slasPorSetor : body.slas_por_setor;
      const parseResult = updateManutencaoSchema.safeParse({ ...body, slasPorSetor: slasInput });
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de configuração inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const acessoTodasPlantas = await possuiAcessoTodasPlantas(req);
      if (!acessoTodasPlantas && !req.user?.plantaId) {
        return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
      }

      const { loteAtualizado, auditLogs } = await AppDataSource.transaction(async (manager) => {
        const loteRepo = manager.getRepository(OrdemTeste);
        const pecaRepo = manager.getRepository(Peca);
        const auditRepo = manager.getRepository(AuditLog);
        const configOpcaoRepo = manager.getRepository(ConfigOpcao);
        const { pecas, slasPorSetor: novosSlas } = parseResult.data;
        const lote = await loteRepo.findOne({
          where: acessoTodasPlantas ? { id } : { id, plantaId: req.user!.plantaId },
          relations: { modelo: { pecas: true, rotas: { setor: true } }, planta: true },
        });

        if (!lote) {
          throw Object.assign(new Error('Ordem de teste não encontrada.'), {
            statusCode: 404,
            code: 'LOTE_NOT_FOUND',
          });
        }

        if (pecas && new Set(pecas.map(({ id: pecaId }) => pecaId)).size !== pecas.length) {
          throw Object.assign(new Error('A mesma peça foi informada mais de uma vez.'), {
            statusCode: 400,
            code: 'PECA_DUPLICADA',
          });
        }

        const auditUsuarioId = req.user?.userId && isUuid(req.user.userId) ? req.user.userId : null;
        const ipAddress = req.ip || req.socket.remoteAddress || null;
        const logsParaSalvar: AuditLog[] = [];

        // SLA efetivo antes da alteração: ordem, snapshot, configuração do modelo e rota.
        const slasAnterioresEfetivos: Record<string, number> = {};
        if (lote.slasPorSetor != null) {
          Object.assign(slasAnterioresEfetivos, lote.slasPorSetor);
        } else if (lote.rotaSnapshot?.slasPorSetor != null) {
          Object.assign(slasAnterioresEfetivos, lote.rotaSnapshot.slasPorSetor);
        } else {
          const modeloSlaMap = (lote.modelo as any)?.slasPorSetor;
          if (modeloSlaMap && typeof modeloSlaMap === 'object') {
            Object.assign(slasAnterioresEfetivos, modeloSlaMap);
          }
          const rotasDaPlanta = (lote.modelo?.rotas || []).filter((rota) => rota.plantaId === lote.plantaId);
          const versaoRota = lote.rotaVersao ?? rotasDaPlanta.reduce((maior, rota) => Math.max(maior, rota.versao || 1), 0);
          for (const rota of rotasDaPlanta.filter((item) => (item.versao || 1) === versaoRota)) {
            const chave = rota.setor?.id || rota.setorId || rota.setor?.nome;
            const valor = Number((rota as any).slaAlvoMin ?? (rota as any).tempoSla ?? (rota as any).tempo_sla ?? 0);
            if (chave && Number.isFinite(valor)) slasAnterioresEfetivos[chave] = valor;
          }
        }

        const diffAnterior: Record<string, number> = {};
        const diffNovo: Record<string, number> = {};
        if (novosSlas !== undefined && novosSlas !== null) {
          const podeEditarRota = await perfilPossuiPermissao(req.user!.perfilId, 'EDITAR_ROTA');
          const todasChaves = Array.from(new Set([...Object.keys(slasAnterioresEfetivos), ...Object.keys(novosSlas)]));
          for (const chave of todasChaves) {
            if (chave === 'default') continue;
            const valorAnterior = slasAnterioresEfetivos[chave] !== undefined ? Number(slasAnterioresEfetivos[chave]) : 0;
            const valorNovo = novosSlas[chave] !== undefined ? Number(novosSlas[chave]) : 0;
            if (valorAnterior !== valorNovo) {
              diffAnterior[chave] = valorAnterior;
              diffNovo[chave] = valorNovo;
            }
          }

          if (Object.keys(diffNovo).length > 0 && !podeEditarRota) {
            throw Object.assign(new Error('Apenas perfis com permissão para editar rotas podem alterar os prazos de produção.'), {
              statusCode: 403,
              code: 'FORBIDDEN_SLA_EDIT',
            });
          }

          if (Object.keys(diffNovo).length > 0) {
            lote.slasPorSetor = novosSlas;
            logsParaSalvar.push(auditRepo.create({
              usuarioId: auditUsuarioId,
              acao: 'SLA_ALTERADO',
              entidadeTipo: 'ordens_teste',
              entidadeId: lote.id,
              dadosAnteriores: diffAnterior,
              dadosNovos: diffNovo,
              ipAddress,
            }));
          }
        }

        if (pecas?.length) {
          const pecasExistentes = await pecaRepo.find({
            where: { id: In(pecas.map(({ id: pecaId }) => pecaId)), modeloId: lote.modeloId },
            relations: { setorCorteOpcao: true },
          });
          const pecasPorId = new Map(pecasExistentes.map((peca) => [peca.id, peca]));
          if (pecasExistentes.length !== pecas.length) {
            throw Object.assign(new Error('Uma das peças informadas não pertence ao modelo desta ordem.'), {
              statusCode: 400,
              code: 'PECA_FORA_DO_MODELO',
            });
          }

          const pecasAlteradas: Array<{ item: typeof pecas[number]; peca: Peca; setorCorteOpcaoAnteriorId: string }> = [];
          for (const item of pecas) {
            const pecaExistente = pecasPorId.get(item.id);
            if (!pecaExistente) {
              throw Object.assign(new Error('Uma das peças informadas não pertence ao modelo desta ordem.'), {
                statusCode: 400,
                code: 'PECA_FORA_DO_MODELO',
              });
            }
            const setorCorteOpcaoAnteriorId = getSetorCorteOpcaoEfetiva(lote, pecaExistente);
            if (setorCorteOpcaoAnteriorId !== item.setorCorteOpcaoId) {
              pecasAlteradas.push({ item, peca: pecaExistente, setorCorteOpcaoAnteriorId });
            }
          }

          const opcaoIds = [...new Set(pecasAlteradas.map(({ item }) => item.setorCorteOpcaoId))];
          const opcoes = opcaoIds.length > 0
            ? await configOpcaoRepo.createQueryBuilder('opcao')
                .innerJoinAndSelect('opcao.categoria', 'categoria')
                .where('opcao.id IN (:...opcaoIds)', { opcaoIds })
                .andWhere('opcao.ativo = TRUE')
                .andWhere('categoria.slug = :slug', { slug: 'subsetor_corte' })
                .andWhere('categoria.ativo = TRUE')
                .getMany()
            : [];
          const opcoesPorId = new Map(opcoes.map((opcao) => [opcao.id, opcao]));
          if (opcoes.length !== opcaoIds.length) {
            throw Object.assign(new Error('Uma das máquinas informadas não é uma opção ativa de subsetor de corte.'), {
              statusCode: 400,
              code: 'OPCAO_CORTE_INVALIDA',
            });
          }

          const tiposSetorPorOpcao = await mapearSubsetoresParaTiposDeSetor(manager, opcaoIds);
          if (tiposSetorPorOpcao.size !== opcaoIds.length) {
            throw Object.assign(new Error('Uma das máquinas informadas não possui setor correspondente configurado.'), {
              statusCode: 400,
              code: 'SETOR_CORTE_NAO_CONFIGURADO',
            });
          }
          const tiposSetorIds = [...new Set(tiposSetorPorOpcao.values())];
          const setoresDisponiveis = await manager.getRepository(Setor).find({
            where: { plantaId: lote.plantaId, tipoOpcaoId: In(tiposSetorIds), ativo: true },
          });
          const tiposDisponiveis = new Set(setoresDisponiveis.map((setor) => setor.tipoOpcaoId));
          if (tiposSetorIds.some((tipoId) => !tiposDisponiveis.has(tipoId))) {
            throw Object.assign(new Error('Uma das máquinas informadas não está disponível na planta desta ordem.'), {
              statusCode: 400,
              code: 'SETOR_CORTE_NAO_DISPONIVEL',
            });
          }

          const idsOpcaoAnterior = [...new Set(pecasAlteradas.map(({ setorCorteOpcaoAnteriorId }) => setorCorteOpcaoAnteriorId))];
          const opcoesAnteriores = idsOpcaoAnterior.length > 0
            ? await configOpcaoRepo.findBy({ id: In(idsOpcaoAnterior) })
            : [];
          const todasOpcoesPorId = new Map([...opcoesAnteriores, ...opcoes].map((opcao) => [opcao.id, opcao]));

          for (const { item, peca: pecaExistente, setorCorteOpcaoAnteriorId } of pecasAlteradas) {
            const novaOpcao = opcoesPorId.get(item.setorCorteOpcaoId);
            if (!novaOpcao) {
              throw Object.assign(new Error('Uma das máquinas informadas não é uma opção ativa de subsetor de corte.'), {
                statusCode: 400,
                code: 'OPCAO_CORTE_INVALIDA',
              });
            }

            const maquinaAnteriorId = setorCorteOpcaoAnteriorId;
            const opcaoAnterior = todasOpcoesPorId.get(maquinaAnteriorId);
            const maquinaAnterior = opcaoAnterior?.valor || opcaoAnterior?.label || 'Sem máquina';
            const maquinaNova = novaOpcao.valor || novaOpcao.label;

            const pecasRemanejadas = { ...(lote.pecasRemanejadas || {}) };
            if (item.setorCorteOpcaoId === pecaExistente.setorCorteOpcaoId) {
              delete pecasRemanejadas[pecaExistente.id];
            } else {
              pecasRemanejadas[pecaExistente.id] = item.setorCorteOpcaoId;
            }
            lote.pecasRemanejadas = Object.keys(pecasRemanejadas).length > 0 ? pecasRemanejadas : null;

            logsParaSalvar.push(auditRepo.create({
              usuarioId: auditUsuarioId,
              acao: 'PECA_REMANEJADA',
              entidadeTipo: 'ordens_teste',
              entidadeId: lote.id,
              dadosAnteriores: {
                pecaId: pecaExistente.id,
                pecaNome: pecaExistente.nome,
                maquinaId: maquinaAnteriorId,
                maquinaNome: maquinaAnterior,
              },
              dadosNovos: {
                pecaId: pecaExistente.id,
                pecaNome: pecaExistente.nome,
                maquinaId: item.setorCorteOpcaoId,
                maquinaNome: maquinaNova,
              },
              ipAddress,
            }));
          }
        }

        await loteRepo.save(lote);
        if (logsParaSalvar.length > 0) {
          await auditRepo.save(logsParaSalvar);
        }

        const loteAtualizado = await loteRepo.findOne({
          where: { id },
          relations: {
            modelo: { pecas: { setorCorteOpcao: true }, marca: true, rotas: { setor: true } },
            planta: true,
            criadoPor: true,
          },
        });
        if (loteAtualizado?.modelo?.rotas) {
          loteAtualizado.modelo.rotas = loteAtualizado.modelo.rotas.filter((rota) => rota.plantaId === loteAtualizado.plantaId);
        }

        const auditLogs = await auditRepo.find({
          where: { entidadeId: id, entidadeTipo: 'ordens_teste' },
          relations: { usuario: true },
          order: { createdAt: 'DESC' },
        });
        return { loteAtualizado, auditLogs };
      });

      return res.json({
        message: 'Configuração da ordem salva com sucesso.',
        lote: loteAtualizado ? {
          ...loteAtualizado,
          slasPorSetor: loteAtualizado.slasPorSetor || null,
          auditLogs: auditLogs.map((log) => ({
            id: log.id,
            acao: log.acao,
            entidadeTipo: log.entidadeTipo,
            dadosAnteriores: log.dadosAnteriores,
            dadosNovos: log.dadosNovos,
            ipAddress: log.ipAddress,
            criadoEm: log.createdAt,
            usuario: log.usuario
              ? {
                  id: log.usuario.id,
                  nome: (log.usuario as any).nomeCompleto || (log.usuario as any).nome || (log.usuario as any).usuario || 'Sistema',
                  nomeCompleto: (log.usuario as any).nomeCompleto || (log.usuario as any).nome || (log.usuario as any).usuario,
                  usuario: (log.usuario as any).usuario,
                }
              : null,
          })),
        } : null,
      });

    } catch (error: any) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[LotesController.updateManutencao] Erro:', error);
      return res.status(500).json({
        error: 'Erro ao salvar a configuração da ordem.',
        code: 'CONFIGURACAO_ORDEM_FAILED',
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
        where: { entidadeId: String(id), entidadeTipo: 'ordens_teste' },
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
