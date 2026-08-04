import { Router } from 'express';
import { ConfiguracoesController } from '../controllers/configuracoes.controller';

const router = Router();
const configuracoesController = new ConfiguracoesController();

/**
 * @swagger
 * /api/configuracoes:
 *   get:
 *     summary: Lista todas as configurações dinâmicas e opções do sistema
 *     description: Retorna os parâmetros de controle, tolerâncias de qualidade e mapeamento de setores.
 *     tags:
 *       - configuracoes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações carregadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   categoria: { type: string }
 *                   chave: { type: string }
 *                   valor: { type: string }
 *                   ativo: { type: boolean }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', configuracoesController.getConfiguracoes);

/**
 * GET /api/config/opcoes/:categoria ou /api/configuracoes/opcoes/:categoria
 * Retorna opções ativas filtradas pela categoria (ex: subsetor_corte)
 */
router.get('/opcoes/:categoria', async (req, res) => {
  try {
    const { AppDataSource } = await import('../config/database');
    const { ConfigOpcao } = await import('../entities/ConfigOpcao');
    const categoria = req.params.categoria;
    const repo = AppDataSource.getRepository(ConfigOpcao);
    const opcoes = await repo
      .createQueryBuilder('o')
      .innerJoin('o.categoria', 'c')
      .where('c.slug = :categoria', { categoria })
      .andWhere('o.ativo = true')
      .orderBy('o.ordem', 'ASC')
      .getMany();
    return res.json(opcoes);
  } catch (error) {
    console.error('[ConfiguracoesRouter] Erro ao buscar opcoes por categoria:', error);
    return res.status(500).json({ error: 'Erro ao buscar opções por categoria.' });
  }
});

/**
 * @swagger
 * /api/configuracoes/{chave}:
 *   put:
 *     summary: Atualiza o valor de uma configuração dinâmica do ERP
 *     description: Altera parâmetros globais operacionais por meio de sua chave identificadora.
 *     tags:
 *       - configuracoes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chave
 *         required: true
 *         schema:
 *           type: string
 *         description: Chave única da configuração
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - valor
 *             properties:
 *               valor:
 *                 type: string
 *                 example: "Novo valor operacional"
 *     responses:
 *       200:
 *         description: Configuração atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chave: { type: string }
 *                 valor: { type: string }
 *                 mensagem: { type: string }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Chave de configuração não localizada
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:chave', configuracoesController.updateConfiguracao);

export default router;
