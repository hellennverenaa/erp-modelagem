import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();
const dashboardController = new DashboardController();

/**
 * @swagger
 * /api/dashboard/kpis:
 *   get:
 *     summary: Retorna os KPIs gerenciais de BI para qualidade e produção
 *     description: Retorna dados consolidados dos 4 KPIs operacionais exigidos pela diretoria.
 *     tags:
 *       - dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPIs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kpi1_fidelidadeEtapas:
 *                   type: number
 *                   example: 94.5
 *                 kpi2_retrabalhoGargalo:
 *                   type: object
 *                   properties:
 *                     setor:
 *                       type: string
 *                       example: "Costura"
 *                     taxa:
 *                       type: number
 *                       example: 12.8
 *                 kpi3_tempoCicloMedio:
 *                   type: number
 *                   example: 180
 *                 kpi4_aprovacaoPrimeira:
 *                   type: number
 *                   example: 88.2
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/kpis', dashboardController.getKpis);

export default router;
