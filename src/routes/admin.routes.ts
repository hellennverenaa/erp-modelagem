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
 *       - admin
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

export default router;
