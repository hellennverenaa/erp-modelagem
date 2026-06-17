import { Router } from 'express';
import { DossieController } from '../controllers/dossie.controller';

const router = Router();
const dossieController = new DossieController();

/**
 * @swagger
 * /api/dossies/gerar:
 *   post:
 *     summary: Inicia a geração automatizada do dossiê final em PDF (Genkit)
 *     description: Consolida todos os dados do lote de testes de produção em um relatório executivo formatado em PDF.
 *     tags:
 *       - dossie
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
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       201:
 *         description: Geração do dossiê iniciada/concluída com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 urlDocumento: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Lote ou ordem de teste inválido
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/gerar', dossieController.gerarDossie);

/**
 * @swagger
 * /api/dossies/{id}:
 *   get:
 *     summary: Busca o registro do dossiê de testes pelo ID
 *     description: Permite obter os links para download do PDF consolidado.
 *     tags:
 *       - dossie
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do dossiê de testes
 *     responses:
 *       200:
 *         description: Dossiê localizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 urlDocumento: { type: string }
 *                 status: { type: string }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Dossiê não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:id', dossieController.getDossieById);

export default router;
