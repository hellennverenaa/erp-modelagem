import { Router } from 'express';
import { RotasController } from '../controllers/rotas.controller';
import { exigirAlgumaPermissao } from '../middlewares/rbac.middleware';

const router = Router();
const rotasController = new RotasController();

/**
 * @swagger
 * /api/rotas/modelos:
 *   get:
 *     summary: Lista modelos ativos para configuração de rotas
 *     description: Inclui modelos com ou sem ordem de teste e com ou sem rota cadastrada.
 *     tags: [Rota]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de modelos ativos
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 */
router.get(
  '/modelos',
  exigirAlgumaPermissao(['TELA_CONSTRUTOR_ROTA']),
  rotasController.listarModelos,
);

/**
 * @swagger
 * /api/rotas/{modeloId}:
 *   put:
 *     summary: Salva a rota de produção de um modelo em uma planta
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
 *             required: [plantaId, rota]
 *             properties:
 *               plantaId: { type: string, format: uuid }
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
router.put(
  '/:modeloId',
  exigirAlgumaPermissao(['EDITAR_TELA_CONSTRUTOR_ROTA', 'CONFIGURAR_MODELO_ORDEM']),
  exigirAlgumaPermissao(['EDITAR_ROTA']),
  rotasController.salvarRota,
);

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
 *       - in: query
 *         name: plantaId
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
router.get(
  '/:modeloId',
  exigirAlgumaPermissao(['TELA_CONSTRUTOR_ROTA', 'TELA_GESTAO_ORDENS', 'TELA_NOVA_ORDEM_TESTE']),
  rotasController.getRota,
);

export default router;
