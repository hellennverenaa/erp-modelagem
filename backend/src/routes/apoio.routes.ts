import { Router } from 'express';
import { ApoioController } from '../controllers/apoio.controller';

const router = Router();
const apoioController = new ApoioController();

/**
 * @swagger
 * /api/apoio/etapa:
 *   post:
 *     summary: Inicia ou conclui uma etapa no setor de apoio
 *     description: Controla os subprocessos do apoio (Serigrafia, Bordado, Costura Programada ou Lab Interno).
 *     tags:
 *       - apoio
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ordemTesteId
 *               - etapaApoioTipo
 *               - status
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               etapaApoioTipo:
 *                 type: string
 *                 enum: [SERIGRAFIA, BORDADO, COSTURA_PROGRAMADA, LABORATORIO]
 *                 example: "SERIGRAFIA"
 *               status:
 *                 type: string
 *                 enum: [AGUARDANDO_INICIO, EM_ANDAMENTO, CONCLUIDO, SUSPENSO]
 *                 example: "EM_ANDAMENTO"
 *     responses:
 *       201:
 *         description: Etapa do apoio registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string }
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/etapa', apoioController.postEtapa);

/**
 * @swagger
 * /api/apoio/laboratorio:
 *   post:
 *     summary: Envia uma amostra do lote de teste para o laboratório interno
 *     description: Abre uma solicitação de teste laboratorial específico para o material.
 *     tags:
 *       - apoio
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ordemTesteId
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               descricaoAnalise:
 *                 type: string
 *                 example: "Teste de tração e adesão do solado"
 *     responses:
 *       201:
 *         description: Envio para laboratório registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 enviadoParaLab: { type: boolean }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/laboratorio', apoioController.postLaboratorio);

/**
 * @swagger
 * /api/apoio/status/{ordemTesteId}:
 *   get:
 *     summary: Retorna o status de processamento do apoio para uma ordem de teste
 *     description: Informa em qual subprocesso do apoio a ordem se encontra e o histórico.
 *     tags:
 *       - apoio
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ordemTesteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da ordem de teste
 *     responses:
 *       200:
 *         description: Status do apoio retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ordemTesteId: { type: string, format: uuid }
 *                 etapaApoioTipo: { type: string }
 *                 status: { type: string }
 *                 tempoProcessamentoMin: { type: integer }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/status/:ordemTesteId', apoioController.getStatus);

export default router;
