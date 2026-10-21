import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { exigirPermissao } from '../middlewares/rbac.middleware';

const router = Router();
const dashboardController = new DashboardController();

/**
 * @swagger
 * /api/dashboard/filters:
 *   get:
 *     summary: Retorna plantas e setores disponíveis nos filtros da Torre de Controle
 *     tags:
 *       - dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Filtros limitados às plantas autorizadas para o usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 acessoTodasPlantas:
 *                   type: boolean
 *                 plantaId:
 *                   type: string
 *                   nullable: true
 *                 plantas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nome:
 *                         type: string
 *                       ativo:
 *                         type: boolean
 *                 setores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nome:
 *                         type: string
 *                       plantaId:
 *                         type: string
 *                       planta:
 *                         type: string
 *                       ativo:
 *                         type: boolean
 *       401:
 *         description: Token JWT inválido ou ausente
 *       403:
 *         description: Usuário sem planta autorizada
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/filters', exigirPermissao('TELA_TORRE_CONTROLE'), dashboardController.getFilters);

/**
 * @swagger
 * /api/dashboard/kpis:
 *   get:
 *     summary: Retorna os KPIs gerenciais da Torre de Controle
 *     description: Sem filtros, consulta todas as datas e plantas autorizadas. O período limita cada indicador pela data da ordem, ocorrência, inspeção ou início/criação do retrabalho. O status dos WIP e das ocorrências continua representando o estado atual.
 *     tags:
 *       - dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: plantaId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Planta específica; usuários sem ACESSAR_TODAS_PLANTAS ficam limitados à própria planta.
 *       - in: query
 *         name: setorId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Limita os indicadores ao setor selecionado.
 *       - in: query
 *         name: dataInicio
 *         schema:
 *           type: string
 *           format: date
 *         description: Primeiro dia incluído no período.
 *       - in: query
 *         name: dataFim
 *         schema:
 *           type: string
 *           format: date
 *         description: Último dia incluído no período.
 *     responses:
 *       200:
 *         description: KPIs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kpiA:
 *                   type: object
 *                   properties:
 *                     totalOrdensAtivas:
 *                       type: integer
 *                     mediaCaixaTeste:
 *                       type: number
 *                     mediaLotePrincipal:
 *                       type: number
 *                     grafico:
 *                       type: array
 *                       items:
 *                         type: object
 *                 kpiB:
 *                   type: array
 *                   items:
 *                     type: object
 *                 kpiC:
 *                   type: object
 *                   properties:
 *                     fpyGlobal:
 *                       type: number
 *                       nullable: true
 *                     totalInspecoes:
 *                       type: integer
 *                     setores:
 *                       type: array
 *                       items:
 *                         type: object
 *                 kpiD:
 *                   type: object
 *                   properties:
 *                     totalRetrabalhos:
 *                       type: integer
 *                     setores:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Filtros inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       403:
 *         description: Planta fora do escopo autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/kpis', exigirPermissao('TELA_TORRE_CONTROLE'), dashboardController.getKpis);

export default router;
