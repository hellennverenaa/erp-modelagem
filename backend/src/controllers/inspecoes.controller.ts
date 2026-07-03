import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { Divergencia } from '../entities/Divergencia';
import { Retrabalho } from '../entities/Retrabalho';
import { Rastreamento, RastreamentoStatus, TipoLote } from '../entities/Rastreamento';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Peca } from '../entities/Peca';
import { IsNull } from 'typeorm';

// ═══ Schema de Validação Zod para a Inspeção ═══
const createInspecaoSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'ordemTesteId deve ser um UUID válido.' }),
  setorId: z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  tipoInspecao: z.nativeEnum(TipoInspecao),
  tipoLote: z.nativeEnum(TipoLote),
  resultado: z.nativeEnum(ResultadoInspecao),
  observacoes: z.string().optional().nullable(),
  // Campos obrigatórios de forma condicional para o Retrabalho Cirúrgico
  setorDestinoId: z.string().uuid({ message: 'setorDestinoId deve ser um UUID válido.' }).optional().nullable(),
  pecaId: z.string().uuid({ message: 'pecaId deve ser um UUID válido.' }).optional().nullable(),
  tipoDivergencia: z.string().optional().default('QUALIDADE'),
  gravidade: z.string().optional().default('ALTA'),
  descricaoDefeito: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.resultado === ResultadoInspecao.REPROVADO) {
    if (!data.setorDestinoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O campo setorDestinoId é obrigatório quando o resultado for REPROVADO.',
        path: ['setorDestinoId'],
      });
    }
  }
});

export class InspecoesController {
  /**
   * POST /api/inspecoes
   * Cria uma inspeção e, em caso de reprovação, abre a divergência/retrabalho sob transação ACID.
   */
  public createInspecao = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Usuário não autenticado.',
          code: 'AUTH_UNAUTHENTICATED'
        });
      }

      // Validação com Zod
      const parseResult = createInspecaoSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de preenchimento inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const {
        ordemTesteId,
        setorId,
        tipoInspecao,
        tipoLote,
        resultado,
        observacoes,
        setorDestinoId,
        pecaId: bodyPecaId,
        tipoDivergencia,
        gravidade,
        descricaoDefeito
      } = parseResult.data;

      // Executa lógica transacional
      const inspecaoSalva = await AppDataSource.transaction(async (transactionalEntityManager) => {
        // 1. Cria e salva a Inspeção
        const inspecao = new Inspecao();
        inspecao.ordemTesteId = ordemTesteId;
        inspecao.setorId = setorId;
        inspecao.tipoInspecao = tipoInspecao;
        inspecao.tipoLote = tipoLote;
        inspecao.resultado = resultado;
        inspecao.observacoes = observacoes || null;
        inspecao.inspetorId = req.user!.userId;
        inspecao.dataInspecao = new Date();

        const savedInspecao = await transactionalEntityManager.save(Inspecao, inspecao);

        // Se for REPROVADO, executa o fluxo do Retrabalho Cirúrgico
        if (resultado === ResultadoInspecao.REPROVADO) {
          if (!setorDestinoId) {
            throw new Error('Setor de destino é obrigatório para retrabalho cirúrgico.');
          }

          // Busca a peça (pecaId) com fallback inteligente
          let pecaId = bodyPecaId || null;

          if (!pecaId) {
            // Fallback 1: Buscar do Rastreamento ativo no setor
            const activeRast = await transactionalEntityManager.findOne(Rastreamento, {
              where: {
                ordemTesteId,
                setorId,
                status: RastreamentoStatus.EM_PROCESSO,
                dataSaida: IsNull()
              }
            });
            pecaId = activeRast?.pecaId || null;
          }

          if (!pecaId) {
            // Fallback 2: Buscar a primeira peça associada ao modelo da ordem de teste
            const ot = await transactionalEntityManager.findOne(OrdemTeste, {
              where: { id: ordemTesteId }
            });
            if (ot) {
              const firstPeca = await transactionalEntityManager.findOne(Peca, {
                where: { modeloId: ot.modeloId }
              });
              pecaId = firstPeca?.id || null;
            }
          }

          if (!pecaId) {
            throw new Error('Não foi possível identificar uma peça correspondente para associar ao retrabalho.');
          }

          // 2. Cria e salva a Divergência
          const divergencia = new Divergencia();
          divergencia.ordemTesteId = ordemTesteId;
          divergencia.inspecaoId = savedInspecao.id;
          divergencia.pecaId = pecaId;
          divergencia.setorId = setorId;
          divergencia.reportadoPorId = req.user!.userId;
          divergencia.descricao = descricaoDefeito || observacoes || 'Defeito de qualidade apontado em inspeção.';
          divergencia.tipoDivergencia = tipoDivergencia || 'QUALIDADE';
          divergencia.gravidade = gravidade || 'ALTA';
          divergencia.resolvido = false;

          const savedDivergencia = await transactionalEntityManager.save(Divergencia, divergencia);

          // 3. Cria e salva o Retrabalho
          const retrabalho = new Retrabalho();
          retrabalho.divergenciaId = savedDivergencia.id;
          retrabalho.ordemTesteId = ordemTesteId;
          retrabalho.pecaId = pecaId;
          retrabalho.setorOrigemId = setorId;
          retrabalho.setorDestinoId = setorDestinoId;
          retrabalho.responsavelId = req.user!.userId;
          retrabalho.descricao = descricaoDefeito || observacoes || 'Retrabalho iniciado por rejeição em inspeção.';
          retrabalho.status = 'PENDENTE';

          await transactionalEntityManager.save(Retrabalho, retrabalho);

          // 4. Busca o Rastreamento ativo no setor atual e altera seu status para EM_RETRABALHO
          const activeRast = await transactionalEntityManager.findOne(Rastreamento, {
            where: {
              ordemTesteId,
              setorId,
              status: RastreamentoStatus.EM_PROCESSO,
              dataSaida: IsNull()
            }
          });

          if (activeRast) {
            activeRast.status = RastreamentoStatus.EM_RETRABALHO;
            await transactionalEntityManager.save(Rastreamento, activeRast);
          }

          // 5. Cria o novo Rastreamento no setorDestino com status = EM_RETRABALHO
          const newRast = new Rastreamento();
          newRast.ordemTesteId = ordemTesteId;
          newRast.setorId = setorDestinoId;
          newRast.pecaId = pecaId;
          newRast.status = RastreamentoStatus.EM_RETRABALHO;
          newRast.tipoLote = tipoLote;
          newRast.dataEntrada = new Date();
          newRast.operadorEntradaId = req.user!.userId;

          await transactionalEntityManager.save(Rastreamento, newRast);
        }

        return savedInspecao;
      });

      return res.status(201).json({
        message: 'Inspeção de qualidade registrada com sucesso.',
        inspecao: inspecaoSalva
      });

    } catch (error: any) {
      console.error('[InspecoesController] Erro ao registrar inspeção:', error);
      return res.status(400).json({
        error: error.message || 'Erro ao registrar inspeção.',
        code: 'INSPECAO_SAVE_FAILED'
      });
    }
  };

  /**
   * GET /api/inspecoes/divergencias
   * Lista todas as divergências ativas
   */
  public getDivergencias = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const divergenciaRepo = AppDataSource.getRepository(Divergencia);
      const divergencias = await divergenciaRepo.find({
        relations: { inspecao: true, peca: true, setor: true, reportadoPor: true },
        order: { createdAt: 'DESC' }
      });
      return res.json(divergencias);
    } catch (error) {
      console.error('[InspecoesController] Erro ao buscar divergências:', error);
      return res.status(500).json({ error: 'Erro ao buscar divergências' });
    }
  };

  /**
   * POST /api/inspecoes/retrabalho
   * Permite registrar manualmente ordens de retrabalho
   */
  public createRetrabalho = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Usuário não autenticado.',
          code: 'AUTH_UNAUTHENTICATED'
        });
      }

      const schema = z.object({
        inspecaoId: z.string().uuid({ message: 'inspecaoId deve ser um UUID válido.' }),
        setorDestinoId: z.string().uuid({ message: 'setorDestinoId deve ser um UUID válido.' }),
        descricaoDefeito: z.string().min(5, { message: 'Descrição do defeito deve conter pelo menos 5 caracteres.' }),
        responsavelRetrabalhoId: z.string().uuid().optional().nullable(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const { inspecaoId, setorDestinoId, descricaoDefeito, responsavelRetrabalhoId } = parseResult.data;

      const inspecaoRepo = AppDataSource.getRepository(Inspecao);
      const inspecao = await inspecaoRepo.findOne({ where: { id: inspecaoId } });
      if (!inspecao) {
        return res.status(404).json({ error: 'Inspeção não encontrada.', code: 'INSPECAO_NOT_FOUND' });
      }

      // Executa lógica transacional
      const retrabalhoSalvo = await AppDataSource.transaction(async (transactionalEntityManager) => {
        // Busca a divergência existente ou cria
        const divergenciaRepo = transactionalEntityManager.getRepository(Divergencia);
        let divergencia = await divergenciaRepo.findOne({ where: { inspecaoId } });

        if (!divergencia) {
          const activeRast = await transactionalEntityManager.findOne(Rastreamento, {
            where: { ordemTesteId: inspecao.ordemTesteId, setorId: inspecao.setorId }
          });
          let pecaId = activeRast?.pecaId || null;

            const ot = await transactionalEntityManager.findOne(OrdemTeste, {
              where: { id: inspecao.ordemTesteId }
            });
            if (ot) {
              const firstPeca = await transactionalEntityManager.findOne(Peca, {
                where: { modeloId: ot.modeloId }
              });
              pecaId = firstPeca?.id || null;
            }

          if (!pecaId) {
            throw new Error('Não foi possível identificar uma peça correspondente para associar à divergência.');
          }

          divergencia = divergenciaRepo.create({
            ordemTesteId: inspecao.ordemTesteId,
            inspecaoId,
            pecaId,
            setorId: inspecao.setorId,
            reportadoPorId: req.user!.userId,
            descricao: descricaoDefeito,
            tipoDivergencia: 'QUALIDADE',
            gravidade: 'ALTA',
            resolvido: false,
          });
          divergencia = await transactionalEntityManager.save(Divergencia, divergencia);
        }

        const retrabalho = new Retrabalho();
        retrabalho.divergenciaId = divergencia.id;
        retrabalho.ordemTesteId = inspecao.ordemTesteId;
        retrabalho.pecaId = divergencia.pecaId!;
        retrabalho.setorOrigemId = inspecao.setorId;
        retrabalho.setorDestinoId = setorDestinoId;
        retrabalho.responsavelId = responsavelRetrabalhoId || req.user!.userId;
        retrabalho.descricao = descricaoDefeito;
        retrabalho.status = 'PENDENTE';

        return await transactionalEntityManager.save(Retrabalho, retrabalho);
      });

      return res.status(201).json({
        message: 'Retrabalho cirúrgico aberto com sucesso.',
        retrabalho: retrabalhoSalvo
      });

    } catch (error: any) {
      console.error('[InspecoesController] Erro ao criar retrabalho:', error);
      return res.status(500).json({ error: error.message || 'Erro ao criar retrabalho' });
    }
  };
}
