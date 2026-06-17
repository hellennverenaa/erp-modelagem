import { Router } from 'express';
import { RastreamentosController } from '../controllers/rastreamentos.controller';

const router = Router();
const rastreamentosController = new RastreamentosController();

/**
 * @swagger
 * /api/rastreamentos/bipar-entrada:
 *   post:
 *     summary: Registra a bipagem de entrada em um setor
 *     description: Cria um registro de rastreamento com data de entrada correspondente ao momento da requisição.
 *     tags:
 *       - rastreamentos
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
 *               - setorId
 *               - tipoLote
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               tipoLote:
 *                 type: string
 *                 enum: [LOTE_PRINCIPAL, CAIXA_TESTE]
 *                 example: "LOTE_PRINCIPAL"
 *               pecaId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               estacaoId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       201:
 *         description: Bipagem de entrada registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Rastreamento'
 *       400:
 *         description: Dados de entrada inválidos ou inconsistentes
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/bipar-entrada', rastreamentosController.biparEntrada);

/**
 * @swagger
 * /api/rastreamentos/bipar-saida:
 *   post:
 *     summary: Registra a bipagem de saída com handoff automático
 *     description: Finaliza o rastreamento ativo de entrada, calculando o tempo de permanência e validando qualidade se necessário.
 *     tags:
 *       - rastreamentos
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
 *               - setorId
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               inspecaoSaidaId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Bipagem de saída registrada com sucesso (handoff concluído)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Rastreamento'
 *       400:
 *         description: Erro de fluxo ou pendência de qualidade
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/bipar-saida', rastreamentosController.biparSaida);

/**
 * @swagger
 * /api/rastreamentos/historico/{ordemTesteId}:
 *   get:
 *     summary: Retorna todo o histórico de movimentação (bipagens) de uma Ordem de Teste
 *     description: Lista cronologicamente todas as passagens de setores do lote/peças de uma ordem.
 *     tags:
 *       - rastreamentos
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
 *         description: Histórico de rastreamento retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Rastreamento'
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/historico/:ordemTesteId', rastreamentosController.getHistorico);

export default router;
