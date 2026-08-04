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

/**
 * POST /api/pecas/modelo/:modeloId
 * Cadastra/Atualiza as peças associadas a um modelo
 */
router.post('/modelo/:modeloId', async (req: Request, res: Response) => {
  try {
    const modeloId = req.params.modeloId as string;
    const { pecas } = req.body;
    
    if (!pecas || !Array.isArray(pecas)) {
      return res.status(400).json({ error: 'Payload deve conter o array de pecas.' });
    }

    const pecaRepo = AppDataSource.getRepository(Peca);
    await pecaRepo.delete({ modeloId });

    const novasPecas = pecas.map((p: any) => pecaRepo.create({
      modeloId,
      nome: p.nome || `${p.numero} - ${p.nome}`,
      setorCorteOpcaoId: p.setorCorteOpcaoId || null,
      descricao: p.descricao || null
    }));

    const saved = await pecaRepo.save(novasPecas);
    return res.status(201).json(saved);
  } catch (error: any) {
    console.error('[PecasRouter] Erro ao salvar peças do modelo:', error);
    return res.status(400).json({ error: error.message || 'Erro ao salvar peças do modelo.' });
  }
});

/**
 * GET /api/catalogo-pecas ou /api/pecas
 * Lista peças técnicas do catálogo
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { CatalogoPeca } = await import('../entities/CatalogoPeca');
    const q = req.query.q as string;
    const repo = AppDataSource.getRepository(CatalogoPeca);
    let query = repo.createQueryBuilder('p').where('p.ativo = true');
    
    if (q) {
      query = query.andWhere('(LOWER(p.nome) LIKE :q OR LOWER(p.numero) LIKE :q OR LOWER(p.codigo_original) LIKE :q)', {
        q: `%${q.toLowerCase()}%`
      });
    }

    const pecas = await query.orderBy('p.numero', 'ASC').addOrderBy('p.nome', 'ASC').getMany();
    return res.json(pecas);
  } catch (error) {
    console.error('[PecasRouter] Erro ao buscar catálogo de peças:', error);
    return res.status(500).json({ error: 'Erro ao buscar catálogo de peças.' });
  }
});

/**
 * POST /api/catalogo-pecas ou /api/pecas
 * Cria uma nova peça no catálogo técnico
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { CatalogoPeca } = await import('../entities/CatalogoPeca');
    const { numero, nome, codigoOriginal, descricao } = req.body;
    
    if (!numero || !nome) {
      return res.status(400).json({ error: 'Campos "numero" e "nome" são obrigatórios.' });
    }

    const repo = AppDataSource.getRepository(CatalogoPeca);
    const novaPeca = repo.create({
      numero: String(numero).trim(),
      nome: String(nome).trim().toUpperCase(),
      codigoOriginal: codigoOriginal ? String(codigoOriginal).trim() : null,
      descricao: descricao ? String(descricao).trim() : null,
      ativo: true
    });

    const saved = await repo.save(novaPeca);
    return res.status(201).json(saved);
  } catch (error: any) {
    console.error('[PecasRouter] Erro ao criar peça no catálogo:', error);
    return res.status(400).json({ error: error.message || 'Erro ao cadastrar peça no catálogo.' });
  }
});

export default router;
