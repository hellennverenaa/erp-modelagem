import { Router } from 'express';
import { ChecklistsController } from '../controllers/checklists.controller';
import { verificarPermissaoSetor } from '../middlewares/rbac.middleware';

const router = Router();
const checklistsController = new ChecklistsController();

/**
 * @swagger
 * /api/checklists/templates:
 *   get:
 *     summary: Lista todos os templates de checklists ativos no sistema
 *     description: Retorna os templates de qualidade dinâmicos para preenchimento no chão de fábrica.
 *     tags:
 *       - checklists
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de templates retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   nome: { type: string }
 *                   versao: { type: integer }
 *                   ativo: { type: boolean }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/templates', checklistsController.getTemplates);

/**
 * @swagger
 * /api/checklists/responder:
 *   post:
 *     summary: Envia as respostas para o preenchimento de um checklist
 *     description: Salva os dados de conformidade informados pelo operador para cada item.
 *     tags:
 *       - checklists
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
 *               - templateId
 *               - respostas
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               templateId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               respostas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemId
 *                     - emConformidade
 *                   properties:
 *                     itemId: { type: string, format: uuid }
 *                     emConformidade: { type: boolean }
 *                     valorInformado: { type: string, nullable: true }
 *                     observacoes: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Respostas do checklist salvas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string, example: "CONCLUIDO" }
 *       400:
 *         description: Dados de preenchimento inválidos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/responder',
  verificarPermissaoSetor('PREENCHER_CHECKLIST', 'body'),
  checklistsController.responderChecklist
);

/**
 * @swagger
 * /api/checklists/{id}:
 *   get:
 *     summary: Busca as informações e respostas de um checklist preenchido pelo ID
 *     description: Retorna o resultado final e respostas detalhadas do checklist.
 *     tags:
 *       - checklists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do checklist preenchido
 *     responses:
 *       200:
 *         description: Dados do checklist encontrados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 ordemTesteId: { type: string, format: uuid }
 *                 templateId: { type: string, format: uuid }
 *                 status: { type: string }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Checklist não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:id', checklistsController.getChecklistById);

export default router;
