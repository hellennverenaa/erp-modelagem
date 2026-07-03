import { Router } from 'express';
import { LotesController } from '../controllers/lotes.controller';

const router = Router();
const lotesController = new LotesController();

/**
 * @swagger
 * /api/lotes:
 *   get:
 *     summary: Lista todas as ordens de teste e lotes cadastrados
 *     description: Retorna a listagem completa de ordens de teste de produção.
 *     tags:
 *       - lotes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ordens de teste retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrdemTeste'
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', lotesController.getLotes);

/**
 * @swagger
 * /api/lotes/{id}:
 *   get:
 *     summary: Busca os detalhes de uma ordem de teste pelo ID
 *     description: Retorna os detalhes completos de uma ordem de teste específica do sistema.
 *     tags:
 *       - lotes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da ordem de teste
 *     responses:
 *       200:
 *         description: Ordem de teste encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdemTeste'
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Ordem de teste não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:id', lotesController.getLoteById);

/**
 * @swagger
 * /api/lotes:
 *   post:
 *     summary: Cria uma nova ordem de teste de produção (Lote)
 *     description: Cria uma ordem de teste definindo o modelo, planta, prioridade e se possui caixa teste.
 *     tags:
 *       - lotes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modeloId
 *               - plantaId
 *               - prioridadePcp
 *             properties:
 *               modeloId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               plantaId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               prioridadePcp:
 *                 type: string
 *                 enum: [BAIXA, MEDIA, ALTA]
 *                 example: "ALTA"
 *               possuiCaixaTeste:
 *                 type: boolean
 *                 example: false
 *               observacoes:
 *                 type: string
 *                 example: "Lote piloto de testes"
 *     responses:
 *       201:
 *         description: Ordem de teste criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdemTeste'
 *       400:
 *         description: Dados de entrada inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', lotesController.createLote);

/**
 * @swagger
 * /api/lotes/{id}:
 *   put:
 *     summary: Atualiza o status e dados de uma ordem de teste
 *     description: Atualiza os dados de uma ordem de teste existente.
 *     tags:
 *       - lotes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da ordem de teste
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: "EM_CORTE"
 *               liberadoProducao:
 *                 type: boolean
 *                 example: true
 *               observacoes:
 *                 type: string
 *                 example: "Observação atualizada"
 *     responses:
 *       200:
 *         description: Ordem de teste atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdemTeste'
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Ordem de teste não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:id', lotesController.updateLote);

export default router;
