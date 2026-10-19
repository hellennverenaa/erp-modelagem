import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Peca } from '../entities/Peca';
import { Modelo } from '../entities/Modelo';
import { OrdemTeste } from '../entities/OrdemTeste';
import { exigirAlgumaPermissao, exigirPermissao } from '../middlewares/rbac.middleware';
import { ModelPiecesError, saveModelPieces } from '../services/model-pieces.service';
import { lockModelConfiguration } from '../services/route-integrity.service';

const router = Router();

/**
 * GET /api/pecas/modelo/:modeloId
 * Retorna a listagem de peças associadas a um modelo específico.
 */
router.get('/modelo/:modeloId', exigirAlgumaPermissao([
  'TELA_CATALOGO_MODELOS', 'TELA_CATALOGO_PECAS', 'TELA_GESTAO_ORDENS',
  'TELA_NOVA_ORDEM_TESTE',
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
  'EDITAR_TELA_CATALOGO_MODELOS', 'CONFIGURAR_MODELO_ORDEM',
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
      await lockModelConfiguration(manager, modeloId.data);
      const modelo = await manager.getRepository(Modelo).findOne({ where: { id: modeloId.data }, select: { id: true } });
      if (!modelo) throw Object.assign(new Error('Modelo não encontrado.'), { code: 'MODELO_NOT_FOUND' });
      const ordem = await manager.getRepository(OrdemTeste).findOne({ where: { modeloId: modelo.id }, select: { id: true } });
      if (ordem) throw Object.assign(new Error('As peças deste modelo devem ser alteradas pela configuração da ordem na fila da Modelagem.'), { code: 'MODEL_PIECES_MANAGED_BY_ORDER' });
      return saveModelPieces(manager, modelo.id, parsed.data.pecas);
    });
    return res.status(201).json(saved);
  } catch (error: any) {
    if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
    if (error?.code === 'MODELO_NOT_FOUND') return res.status(404).json({ error: error.message, code: error.code });
    if (error?.code === 'MODEL_PIECES_MANAGED_BY_ORDER') return res.status(409).json({ error: error.message, code: error.code });
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
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const page = req.query.page ? Math.max(1, Number(req.query.page) || 1) : undefined;
    const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit) || 50)) : undefined;

    const repo = AppDataSource.getRepository(CatalogoPeca);
    let query = repo.createQueryBuilder('p').where('p.ativo = true');
    
    if (q) {
      query = query.andWhere('(LOWER(p.nome) LIKE :q OR LOWER(p.numero) LIKE :q OR LOWER(p.codigo_original) LIKE :q)', {
        q: `%${q.toLowerCase()}%`
      });
    }

    query = query.orderBy('p.numero', 'ASC').addOrderBy('p.nome', 'ASC');

    let pecas: InstanceType<typeof CatalogoPeca>[];
    let total = 0;

    if (page !== undefined || limit !== undefined) {
      const take = limit || 50;
      const skip = ((page || 1) - 1) * take;
      const [items, count] = await query.skip(skip).take(take).getManyAndCount();
      pecas = items;
      total = count;
    } else {
      pecas = await query.getMany();
      total = pecas.length;
    }

    res.setHeader('X-Total-Count', total);

    if (page !== undefined || limit !== undefined) {
      const take = limit || 50;
      return res.json({
        data: pecas,
        total,
        page: page || 1,
        limit: take,
        totalPages: Math.ceil(total / take)
      });
    }

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
