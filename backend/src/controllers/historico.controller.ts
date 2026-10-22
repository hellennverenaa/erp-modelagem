import { Request, Response } from 'express';
import { z } from 'zod';
import { perfilPossuiPermissao } from '../services/rbac.service';
import {
  buscarMovimentacoes,
  buscarOpcoesHistorico,
  buscarPlantaHistorico,
  buscarSetorHistorico,
  CategoriaHistorico,
  EscopoHistorico,
  FiltrosHistorico,
} from '../services/historico.service';

const dataIsoSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data no formato AAAA-MM-DD.')
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, 'A data informada não existe.');

const categoriaSchema = z.enum([
  'CONFIGURACAO',
  'ORDEM',
  'BIPAGEM',
  'QUALIDADE',
  'OCORRENCIA',
  'RETRABALHO',
  'CHECKLIST',
  'CORTE_APOIO',
]);

const filtrosSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  dataInicio: dataIsoSchema.optional(),
  dataFim: dataIsoSchema.optional(),
  plantaId: z.string().uuid().optional(),
  setorId: z.string().uuid().optional(),
  categoria: categoriaSchema.optional(),
  busca: z.string().trim().min(1).max(100).optional(),
}).superRefine((filtros, contexto) => {
  if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
    contexto.addIssue({
      code: 'custom',
      message: 'A data inicial deve ser anterior ou igual à data final.',
      path: ['dataInicio'],
    });
  }
});

const filtrosOpcoesSchema = z.object({
  plantaId: z.string().uuid().optional(),
});

class HistoricoRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class HistoricoController {
  private async resolverEscopo(req: Request, plantaIdSolicitada?: string): Promise<EscopoHistorico> {
    if (!req.user) {
      throw new HistoricoRequestError(401, 'AUTH_UNAUTHENTICATED', 'Usuário não autenticado.');
    }

    const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
    if (acessoTodasPlantas) {
      if (plantaIdSolicitada && !await buscarPlantaHistorico(plantaIdSolicitada)) {
        throw new HistoricoRequestError(400, 'PLANTA_INVALIDA', 'A planta informada não foi encontrada.');
      }
      return { acessoTodasPlantas: true, plantaId: plantaIdSolicitada ?? null };
    }

    if (!req.user.plantaId) {
      throw new HistoricoRequestError(403, 'PLANTA_NAO_CONFIGURADA', 'O usuário não possui uma planta associada.');
    }
    if (plantaIdSolicitada && plantaIdSolicitada !== req.user.plantaId) {
      throw new HistoricoRequestError(403, 'PLANTA_FORA_DO_ESCOPO', 'O usuário não tem acesso à planta informada.');
    }

    return { acessoTodasPlantas: false, plantaId: req.user.plantaId };
  }

  private responderErro(error: unknown, res: Response, contexto: string): Response {
    if (error instanceof HistoricoRequestError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error(`[HistoricoController] ${contexto}:`, error);
    return res.status(500).json({
      error: 'Não foi possível consultar o histórico de movimentações.',
      code: 'HISTORICO_CONSULTA_FAILED',
    });
  }

  public getOpcoes = async (req: Request, res: Response): Promise<Response> => {
    const resultado = filtrosOpcoesSchema.safeParse(req.query);
    if (!resultado.success) {
      return res.status(400).json({ error: 'Filtros inválidos.', code: 'HISTORICO_FILTERS_INVALID' });
    }

    try {
      const escopo = await this.resolverEscopo(req, resultado.data.plantaId);
      return res.json(await buscarOpcoesHistorico(escopo));
    } catch (error) {
      return this.responderErro(error, res, 'Erro ao carregar filtros');
    }
  };

  public getMovimentacoes = async (req: Request, res: Response): Promise<Response> => {
    const resultado = filtrosSchema.safeParse(req.query);
    if (!resultado.success) {
      return res.status(400).json({
        error: 'Filtros inválidos.',
        code: 'HISTORICO_FILTERS_INVALID',
        details: resultado.error.flatten().fieldErrors,
      });
    }

    try {
      const filtros: FiltrosHistorico = {
        ...resultado.data,
        categoria: resultado.data.categoria as CategoriaHistorico | undefined,
      };
      const escopo = await this.resolverEscopo(req, filtros.plantaId);

      if (filtros.setorId) {
        const setor = await buscarSetorHistorico(filtros.setorId);
        if (!setor) {
          return res.status(400).json({ error: 'O setor informado não foi encontrado.', code: 'SETOR_INVALIDO' });
        }
        if (escopo.plantaId && setor.plantaId !== escopo.plantaId) {
          return res.status(403).json({ error: 'O setor informado está fora do escopo autorizado.', code: 'SETOR_FORA_DO_ESCOPO' });
        }
      }

      return res.json(await buscarMovimentacoes(escopo, filtros));
    } catch (error) {
      return this.responderErro(error, res, 'Erro ao buscar movimentações');
    }
  };
}
