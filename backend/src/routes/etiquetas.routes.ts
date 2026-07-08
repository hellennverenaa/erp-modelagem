import { Router } from 'express';
import { EtiquetaController } from '../controllers/etiqueta.controller';
import { verificarPermissaoSetor } from '../middlewares/rbac.middleware';

const router = Router();
const etiquetaController = new EtiquetaController();

/**
 * @swagger
 * /api/etiquetas/gerar:
 *   post:
 *     summary: Gera um arquivo PDF de etiquetas para impressao
 *     description: Retorna um documento PDF formatado para folha A4 com gabarito de 10 etiquetas destacados (2x5).
 *     tags:
 *       - etiquetas
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ordemTesteIds
 *               - setorId
 *             properties:
 *               ordemTesteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["c7c66e17-6d0d-428a-89ad-438f735cef78"]
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "ecb2d21d-51db-41a7-8261-17e8a5f03fed"
 *     responses:
 *       200:
 *         description: Documento PDF de etiquetas gerado com sucesso
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados de entrada invalidos
 *       401:
 *         description: Token JWT invalido ou ausente
 *       403:
 *         description: Permissao negada para acao IMPRIMIR_ETIQUETA neste setor
 *       404:
 *         description: Nenhuma ordem de teste encontrada
 *       500:
 *         description: Erro interno ao gerar o PDF
 */
router.post(
  '/gerar',
  verificarPermissaoSetor('IMPRIMIR_ETIQUETA', 'body'),
  etiquetaController.gerarEtiquetas
);

export default router;
