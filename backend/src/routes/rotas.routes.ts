import { Router } from 'express';
import { RotasController } from '../controllers/rotas.controller';

const router = Router();
const rotasController = new RotasController();

/**
 * @swagger
 * /api/rotas/{modeloId}:
 *   put:
 *     summary: Salva a rota de produção de um modelo
 *     tags: [Rota]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modeloId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rota]
 *             properties:
 *               rota:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [setorId, ordem]
 *                   properties:
 *                     setorId: { type: string, format: uuid }
 *                     ordem: { type: integer, example: 1 }
 *                     obrigatorio: { type: boolean, default: true }
 *                     tipoExecucao: { type: string, enum: [SEQUENCIAL, PARALELO] }
 *                     bipagemApenasSaida: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Rota salva com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Modelo não encontrado
 */
router.put('/:modeloId', rotasController.salvarRota);

/**
 * @swagger
 * /api/rotas/{modeloId}:
 *   get:
 *     summary: Obtém a rota de produção de um modelo
 *     tags: [Rota]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modeloId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rota de produção do modelo
 *       404:
 *         description: Rota não encontrada
 */
router.get('/:modeloId', rotasController.getRota);

export default router;
