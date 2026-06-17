import { Router } from 'express';
import { InspecoesController } from '../controllers/inspecoes.controller';

const router = Router();
const inspecoesController = new InspecoesController();

/**
 * @swagger
 * /api/inspecoes:
 *   post:
 *     summary: Registra uma nova inspeção de qualidade de lote/peça
 *     description: Cria o registro de inspeção, definindo os volumes aprovados e reprovados e o resultado de conformidade.
 *     tags:
 *       - inspecoes
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
 *               - tipoInspecao
 *               - tipoLote
 *               - quantidadePecasInspecionadas
 *               - resultadoFinal
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               tipoInspecao:
 *                 type: string
 *                 enum: [CONVENCIONAL, LABORATORIAL, RETRABALHO]
 *                 example: "CONVENCIONAL"
 *               tipoLote:
 *                 type: string
 *                 enum: [LOTE_PRINCIPAL, CAIXA_TESTE]
 *                 example: "LOTE_PRINCIPAL"
 *               quantidadePecasInspecionadas:
 *                 type: integer
 *                 example: 50
 *               quantidadePecasAprovadas:
 *                 type: integer
 *                 example: 48
 *               quantidadePecasReprovadas:
 *                 type: integer
 *                 example: 2
 *               resultadoFinal:
 *                 type: string
 *                 enum: [APROVADO, REPROVADO, APROVADO_COM_DIVERGENCIA, ENVIADO_PARA_RETRABALHO]
 *                 example: "APROVADO_COM_DIVERGENCIA"
 *               observacoes:
 *                 type: string
 *                 example: "Detecção de divergência menor no cabedal"
 *     responses:
 *       201:
 *         description: Inspeção de qualidade registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 resultadoFinal: { type: string }
 *       400:
 *         description: Dados de inspeção inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', inspecoesController.createInspecao);

/**
 * @swagger
 * /api/inspecoes/divergencias:
 *   get:
 *     summary: Lista as divergências registradas nas inspeções
 *     description: Retorna as divergências ou falhas de qualidade catalogadas nas inspeções.
 *     tags:
 *       - inspecoes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de divergências retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   inspecaoId: { type: string, format: uuid }
 *                   opcaoDivergenciaId: { type: string, format: uuid }
 *                   quantidade: { type: integer }
 *                   observacoes: { type: string }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/divergencias', inspecoesController.getDivergencias);

/**
 * @swagger
 * /api/inspecoes/retrabalho:
 *   post:
 *     summary: Solicita o envio de um lote/peça defeituoso para retrabalho em um setor anterior
 *     description: Cria uma ordem de retrabalho com o diagnóstico de defeito e define o setor de destino para correção.
 *     tags:
 *       - inspecoes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspecaoId
 *               - setorDestinoId
 *               - descricaoDefeito
 *             properties:
 *               inspecaoId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               setorDestinoId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               descricaoDefeito:
 *                 type: string
 *                 example: "Costura torta no calcanhar"
 *               responsavelRetrabalhoId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       201:
 *         description: Ordem de retrabalho aberta com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 resolvido: { type: boolean, example: false }
 *       400:
 *         description: Dados de entrada inconsistentes
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/retrabalho', inspecoesController.createRetrabalho);

export default router;
