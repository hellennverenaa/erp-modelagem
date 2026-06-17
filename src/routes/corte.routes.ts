import { Router } from 'express';
import { CorteController } from '../controllers/corte.controller';

const router = Router();
const corteController = new CorteController();

/**
 * @swagger
 * /api/corte/distribuir:
 *   post:
 *     summary: Distribui o lote de corte para as máquinas automáticas
 *     description: Realiza a distribuição de peças conforme a capacidade operativa de cada máquina de corte.
 *     tags:
 *       - corte
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
 *     responses:
 *       201:
 *         description: Distribuição efetuada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 distribuidos: { type: integer }
 *       400:
 *         description: Erro na distribuição do lote
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/distribuir', corteController.distribuirCorte);

/**
 * @swagger
 * /api/corte/bipar:
 *   post:
 *     summary: Executa a bipagem dupla no processo de corte automático
 *     description: Valida o código de barras da peça contra o código da máquina de corte automático antes de iniciar.
 *     tags:
 *       - corte
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - codigoPeca
 *               - codigoMaquina
 *             properties:
 *               codigoPeca:
 *                 type: string
 *                 example: "PEC-987654"
 *               codigoMaquina:
 *                 type: string
 *                 example: "MAQ-CORTE-02"
 *     responses:
 *       201:
 *         description: Dupla bipagem validada e registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 bipagemDuplaOk: { type: boolean }
 *       400:
 *         description: Divergência entre peça e máquina (bipagem inválida)
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/bipar', corteController.biparCorte);

/**
 * @swagger
 * /api/corte/eficiencia:
 *   get:
 *     summary: Retorna a eficiência operacional das máquinas de corte automático
 *     description: Retorna o balanço de peças processadas e perdas de material.
 *     tags:
 *       - corte
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados de eficiência retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eficienciaPercentual: { type: number, example: 92.4 }
 *                 pecasCortadas: { type: integer }
 *                 divergenciasDetectadas: { type: integer }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/eficiencia', corteController.getEficiencia);

export default router;
