import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Peca } from '../entities/Peca';
import { Modelo } from '../entities/Modelo';
import { exigirAlgumaPermissao, exigirPermissao } from '../middlewares/rbac.middleware';
import { ModelPiecesError, saveModelPieces } from '../services/model-pieces.service';

const router = Router();

/**
 * GET /api/pecas/modelo/:modeloId
 * Retorna a listagem de peças associadas a um modelo específico.
 */
router.get('/modelo/:modeloId', exigirAlgumaPermissao([
  'TELA_CATALOGO_MODELOS', 'TELA_CATALOGO_PECAS', 'TELA_GESTAO_ORDENS',
  'TELA_NOVA_ORDEM_TESTE', 'TELA_CHECKLIST',
]), async (req: Request, res: Response) => {
  try {
    const modeloId = req.params.modeloId as string;
    const pecaRepo = AppDataSource.getRepository(Peca);
    
    const pecas = await pecaRepo.find({
      where: { modeloId },
      relations: { catalogoPeca: true, setorCorteOpcao: true },
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
router.post('/modelo/:modeloId', exigirAlgumaPermissao([
  'EDITAR_TELA_CATALOGO_MODELOS', 'EDITAR_TELA_NOVA_ORDEM_TESTE',
]), async (req: Request, res: Response) => {
  const modeloId = z.string().uuid().safeParse(req.params.modeloId);
  const parsed = z.object({ pecas: z.array(z.object({
    id: z.string().uuid().optional(),
    catalogoPecaId: z.string().uuid(),
    setorCorteOpcaoId: z.string().uuid(),
  })).min(2) }).safeParse(req.body);
  if (!modeloId.success || !parsed.success) {
    return res.status(400).json({ error: 'Informe peças e sub-setores válidos para o modelo.', code: 'VALIDATION_ERROR' });
  }
  try {
    const saved = await AppDataSource.transaction(async (manager) => {
      const modelo = await manager.getRepository(Modelo).findOne({ where: { id: modeloId.data }, select: { id: true } });
      if (!modelo) throw Object.assign(new Error('Modelo não encontrado.'), { code: 'MODELO_NOT_FOUND' });
      return saveModelPieces(manager, modelo.id, parsed.data.pecas);
    });
    return res.status(201).json(saved);
  } catch (error: any) {
    if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
    if (error?.code === 'MODELO_NOT_FOUND') return res.status(404).json({ error: error.message, code: error.code });
    console.error('[PecasRouter] Erro ao salvar peças do modelo:', error);
    return res.status(400).json({ error: error.message || 'Erro ao salvar peças do modelo.' });
  }
});

/**
 * GET /api/catalogo-pecas ou /api/pecas
 * Lista peças técnicas do catálogo
 */
router.get('/', exigirAlgumaPermissao(['TELA_CATALOGO_PECAS', 'TELA_NOVA_ORDEM_TESTE']), async (req: Request, res: Response) => {
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
router.post('/', exigirPermissao('EDITAR_TELA_CATALOGO_PECAS'), async (req: Request, res: Response) => {
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
