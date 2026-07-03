import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';

const router = Router();
const adminController = new AdminController();

/**
 * @swagger
 * /api/admin/usuarios:
 *   get:
 *     summary: Lista todos os usuários cadastrados no sistema (Admin)
 *     description: Retorna a listagem completa de usuários com controle de perfil. Apenas acessível por administradores.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Token JWT inválido ou ausente
 *       403:
 *         description: Acesso negado (permissão de Admin necessária)
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios', adminController.getUsuarios);

/**
 * @swagger
 * /api/admin/permissoes/{perfilId}:
 *   get:
 *     summary: Obtém a matriz de permissões para um determinado perfil
 *     description: Retorna todas as permissões associadas a um perfil, incluindo privilégios por setor do chão de fábrica (RBAC).
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: perfilId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do perfil para buscar as permissões
 *     responses:
 *       200:
 *         description: Matriz de permissões retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   perfilId: { type: string, format: uuid }
 *                   setorId: { type: string, format: uuid, nullable: true }
 *                   acao: { type: string }
 *                   permitido: { type: boolean }
 *                   createdAt: { type: string, format: date-time }
 *                   updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       403:
 *         description: Acesso negado (permissão de Admin necessária)
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/permissoes/:perfilId', adminController.getPermissoes);

/**
 * @swagger
 * /api/admin/permissoes:
 *   put:
 *     summary: Altera ou cria dinamicamente permissões RBAC de perfis (Upsert)
 *     description: Permite conceder ou revogar o acesso a ações específicas nos setores do chão de fábrica.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - perfilId
 *                 - acao
 *                 - permitido
 *               properties:
 *                 perfilId:
 *                   type: string
 *                   format: uuid
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 setorId:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *                   example: null
 *                 acao:
 *                   type: string
 *                   example: "BIPAR_ENTRADA"
 *                 permitido:
 *                   type: boolean
 *                   example: true
 *     responses:
 *       200:
 *         description: Permissões atualizadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   perfilId: { type: string, format: uuid }
 *                   setorId: { type: string, format: uuid, nullable: true }
 *                   acao: { type: string }
 *                   permitido: { type: boolean }
 *       400:
 *         description: Erro de validação ou dados incompletos
 *       401:
 *         description: Token JWT inválido ou ausente
 *       403:
 *         description: Acesso negado (permissão de Admin necessária)
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/permissoes', adminController.updatePermissoes);

export default router;
