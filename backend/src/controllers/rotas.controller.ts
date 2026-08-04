import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { RotaModelo, TipoExecucao } from '../entities/RotaModelo';
import { Modelo } from '../entities/Modelo';
import { Setor } from '../entities/Setor';
import { In } from 'typeorm';

const itemRotaSchema = z.object({
  setorId: z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  ordem: z.number().int().min(1),
  obrigatorio: z.boolean().optional().default(true),
  tipoExecucao: z.nativeEnum(TipoExecucao).optional().default(TipoExecucao.SEQUENCIAL),
  bipagemApenasSaida: z.boolean().optional().default(false)
});

const salvarRotaSchema = z.object({
  rota: z.array(itemRotaSchema)
});

export class RotasController {
  /**
   * PUT /api/rotas/:modeloId
   * Salva (sobrescreve) a rota de produção de um modelo.
   */
  public salvarRota = async (req: Request, res: Response): Promise<Response> => {
    const modeloId = req.params.modeloId as string;

    if (!modeloId || !/^[0-9a-f-]{36}$/i.test(String(modeloId))) {
      return res.status(400).json({ error: 'modeloId inválido.', code: 'VALIDATION_ERROR' });
    }

    const parseResult = salvarRotaSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Estrutura da rota inválida.',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors
      });
    }

    const { rota } = parseResult.data;

    try {
      const modeloRepo = AppDataSource.getRepository(Modelo);
      const modelo = await modeloRepo.findOne({ where: { id: modeloId } });
      if (!modelo) {
        return res.status(404).json({ error: 'Modelo não encontrado.', code: 'MODELO_NOT_FOUND' });
      }

      // Validação de existência dos setores (Prevenção de FK Constraint Error)
      const setorIdsPayload = Array.from(new Set(rota.map(r => r.setorId)));
      const setorRepo = AppDataSource.getRepository(Setor);
      const setoresExistentes = await setorRepo.find({
        where: { id: In(setorIdsPayload) }
      });
      const idsExistentes = setoresExistentes.map(s => s.id);
      
      const setoresFaltantes = setorIdsPayload.filter(id => !idsExistentes.includes(id));
      if (setoresFaltantes.length > 0) {
        return res.status(400).json({
          error: 'Um ou mais Setores fornecidos não existem no banco de dados. Foreign Key constraint validation failed.',
          code: 'SETORES_NOT_FOUND',
          invalidIds: setoresFaltantes
        });
      }

      // Executa tudo dentro de uma transação
      await AppDataSource.transaction(async (transactionalEntityManager) => {
        const rotaRepo = transactionalEntityManager.getRepository(RotaModelo);

        // 1. Remove toda a rota existente para este modelo
        await rotaRepo.delete({ modeloId });

        // 2. Insere os novos itens da rota
        const novosItens = rota.map((item) => {
          return rotaRepo.create({
            modeloId,
            setorId: item.setorId,
            ordem: item.ordem,
            obrigatorio: item.obrigatorio,
            tipoExecucao: item.tipoExecucao,
            bipagemApenasSaida: item.bipagemApenasSaida
          });
        });

        await rotaRepo.save(novosItens);
      });

      return res.status(200).json({
        message: 'Rota de produção salva com sucesso.',
        totalSetores: rota.length
      });

    } catch (error: any) {
      console.error('[RotasController.salvarRota] Erro interno:', error.message || error);
      return res.status(500).json({
        error: 'Erro interno ao salvar a rota de produção. ' + (error.message || ''),
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/rotas/:modeloId
   * Obtém a rota de produção de um modelo.
   */
  public getRota = async (req: Request, res: Response): Promise<Response> => {
    const modeloId = req.params.modeloId as string;

    if (!modeloId || !/^[0-9a-f-]{36}$/i.test(String(modeloId))) {
      return res.status(400).json({ error: 'modeloId inválido.', code: 'VALIDATION_ERROR' });
    }

    try {
      const rotaRepo = AppDataSource.getRepository(RotaModelo);
      const rota = await rotaRepo.find({
        where: { modeloId },
        relations: { setor: true },
        order: { ordem: 'ASC' }
      });

      return res.status(200).json({
        modeloId,
        rota
      });

    } catch (error: any) {
      console.error('[RotasController.getRota] Erro interno:', error.message || error);
      return res.status(500).json({
        error: 'Erro interno ao buscar rota de produção.',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}
