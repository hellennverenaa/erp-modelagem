import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Peca } from '../entities/Peca';

const router = Router();

/**
 * GET /api/pecas/modelo/:modeloId
 * Retorna a listagem de peças associadas a um modelo específico.
 */
router.get('/modelo/:modeloId', async (req: Request, res: Response) => {
  try {
    const modeloId = req.params.modeloId as string;
    const pecaRepo = AppDataSource.getRepository(Peca);
    
    const pecas = await pecaRepo.find({
      where: { modeloId },
      order: { nome: 'ASC' }
    });

    return res.json(pecas);
  } catch (error) {
    console.error('[PecasRouter] Erro ao buscar pecas do modelo:', error);
    return res.status(500).json({ error: 'Erro ao buscar peças do modelo.' });
  }
});

export default router;
