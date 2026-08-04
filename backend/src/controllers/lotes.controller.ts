import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { RotaModelo } from '../entities/RotaModelo';
import { Peca } from '../entities/Peca';

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

const updateManutencaoSchema = z.object({
  dataPrevistaProducao: z.string().optional().nullable(),
  slasPorSetor: z.record(z.string(), z.number()).optional().nullable(),
  pecas: z.array(z.object({
    id: z.string().uuid(),
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
          modelo: { pecas: { setorCorteOpcao: true }, marca: true },
          planta: true,
          criadoPor: true
        },
        order: { createdAt: 'DESC' }
      });
      return res.json(lotes);
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
          modelo: { pecas: { setorCorteOpcao: true }, marca: true },
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

      return res.json(lote);
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
        relations: { modelo: { pecas: true }, planta: true }
      });

      if (!lote) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'LOTE_NOT_FOUND'
        });
      }

      const { dataPrevistaProducao, slasPorSetor, pecas } = parseResult.data;

      if (dataPrevistaProducao !== undefined) {
        lote.dataPrevistaProducao = dataPrevistaProducao ? new Date(dataPrevistaProducao) : null;
      }
      if (slasPorSetor !== undefined) {
        lote.slasPorSetor = slasPorSetor;
      }

      await loteRepo.save(lote);

      // Remanejamento de Peças de Corte
      if (pecas && pecas.length > 0) {
        for (const p of pecas) {
          if (p.id && p.setorCorteOpcaoId) {
            await pecaRepo.update({ id: p.id }, { setorCorteOpcaoId: p.setorCorteOpcaoId });
          }
        }
      }

      const loteAtualizado = await loteRepo.findOne({
        where: { id },
        relations: { modelo: { pecas: true, marca: true }, planta: true, criadoPor: true }
      });

      return res.json({
        message: 'Manutenção da Ordem realizada com sucesso.',
        lote: loteAtualizado
      });

    } catch (error: any) {
      console.error('[LotesController.updateManutencao] Erro:', error);
      return res.status(500).json({
        error: error.message || 'Erro ao realizar manutenção da ordem.',
        code: 'MANUTENCAO_FAILED'
      });
    }
  };
}
