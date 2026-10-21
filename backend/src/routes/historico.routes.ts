import { Router } from 'express';
import { HistoricoController } from '../controllers/historico.controller';

const router = Router();
const historicoController = new HistoricoController();

/**
 * @swagger
 * /api/historico/filtros:
 *   get:
 *     summary: Lista as opções de filtro do histórico conforme o escopo de planta autorizado
 *     tags: [historico]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plantas, setores e categorias disponíveis
 *       403:
 *         description: Acesso ou escopo de planta negado
 */
router.get('/filtros', historicoController.getOpcoes);

/**
 * @swagger
 * /api/historico/movimentacoes:
 *   get:
 *     summary: Consulta o histórico global de auditoria e movimentações operacionais
 *     tags: [historico]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 25 }
 *       - in: query
 *         name: dataInicio
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dataFim
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: plantaId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: setorId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: categoria
 *         schema:
 *           type: string
 *           enum: [CONFIGURACAO, ORDEM, BIPAGEM, QUALIDADE, OCORRENCIA, RETRABALHO, CHECKLIST, CORTE_APOIO]
 *       - in: query
 *         name: busca
 *         schema: { type: string, maxLength: 100 }
 *     responses:
 *       200:
 *         description: Página de eventos ordenados por data decrescente
 *       400:
 *         description: Filtros inválidos
 *       403:
 *         description: Acesso ou escopo de planta negado
 */
router.get('/movimentacoes', historicoController.getMovimentacoes);

export default router;
