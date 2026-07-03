import { Router } from 'express';
import { InspecoesController } from '../controllers/inspecoes.controller';
import { verificarPermissaoSetor } from '../middlewares/rbac.middleware';

const router = Router();
const inspecoesController = new InspecoesController();

/**
 * @swagger
 * /api/inspecoes:
 *   post:
 *     summary: Registra uma nova inspeção de qualidade de lote/peça
 *     description: Cria o registro de inspeção, abrindo divergências e ordens de retrabalho se o resultado for REPROVADO.
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
 *               - setorId
 *               - tipoInspecao
 *               - tipoLote
 *               - resultado
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440001"
 *               tipoInspecao:
 *                 type: string
 *                 enum: [SAIDA_SETOR, FORMAL, LABORATORIO, LABORATORIO_APOIO]
 *                 example: "SAIDA_SETOR"
 *               tipoLote:
 *                 type: string
 *                 enum: [LOTE_PRINCIPAL, CAIXA_TESTE]
 *                 example: "LOTE_PRINCIPAL"
 *               resultado:
 *                 type: string
 *                 enum: [APROVADO, REPROVADO, APROVADO_PARCIAL, APROVADO_CONCESSAO]
 *                 example: "APROVADO"
 *               observacoes:
 *                 type: string
 *                 nullable: true
 *                 example: "Inspeção visual realizada no lote."
 *               setorDestinoId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *                 description: Setor de destino para o retrabalho. Obrigatório se o resultado for REPROVADO.
 *               pecaId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *                 description: ID da peça avaliada.
 *               tipoDivergencia:
 *                 type: string
 *                 example: "QUALIDADE"
 *               gravidade:
 *                 type: string
 *                 example: "ALTA"
 *               descricaoDefeito:
 *                 type: string
 *                 nullable: true
 *                 example: "Costura torta no calcanhar"
 *     responses:
 *       201:
 *         description: Inspeção de qualidade registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Inspeção de qualidade registrada com sucesso."
 *                 inspecao:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     ordemTesteId: { type: string, format: uuid }
 *                     setorId: { type: string, format: uuid }
 *                     tipoInspecao: { type: string }
 *                     tipoLote: { type: string }
 *                     resultado: { type: string }
 *                     observacoes: { type: string, nullable: true }
 *                     inspetorId: { type: string, format: uuid }
 *                     dataInspecao: { type: string, format: date-time }
 *       400:
 *         description: Dados de inspeção inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/',
  verificarPermissaoSetor('INSPECIONAR_SETOR', 'body'),
  inspecoesController.createInspecao
);

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
 *                   ordemTesteId: { type: string, format: uuid }
 *                   inspecaoId: { type: string, format: uuid, nullable: true }
 *                   pecaId: { type: string, format: uuid, nullable: true }
 *                   setorId: { type: string, format: uuid }
 *                   reportadoPorId: { type: string, format: uuid }
 *                   descricao: { type: string }
 *                   tipoDivergencia: { type: string }
 *                   gravidade: { type: string }
 *                   resolvido: { type: boolean }
 *                   dataResolucao: { type: string, format: date-time, nullable: true }
 *                   resolvidoPorId: { type: string, format: uuid, nullable: true }
 *                   createdAt: { type: string, format: date-time }
 *                   updatedAt: { type: string, format: date-time }
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
