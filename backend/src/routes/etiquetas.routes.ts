import { Router } from 'express';
import {
  imprimirEtiquetas,
  gerarEtiquetas,
  gerarTicketsSetor,
  gerarTicketsCorte,
  gerarTicketsCompletosDaOrdem,
} from '../controllers/etiqueta.controller';
import { exigirAlgumaPermissao, verificarPermissaoSetor } from '../middlewares/rbac.middleware';

const router = Router();

router.post('/imprimir', exigirAlgumaPermissao([
  'EDITAR_TELA_GESTAO_ORDENS', 'EDITAR_TELA_NOVA_ORDEM_TESTE', 'EDITAR_TELA_BIPAGEM',
]), verificarPermissaoSetor('BIPAR_ENTRADA'), imprimirEtiquetas);

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
  exigirAlgumaPermissao(['EDITAR_TELA_GESTAO_ORDENS', 'EDITAR_TELA_NOVA_ORDEM_TESTE']),
  gerarEtiquetas
);

/**
 * @swagger
 * /api/etiquetas/tickets-setor:
 *   post:
 *     summary: Gera PDF com tickets únicos dos setores de uma ordem
 *     description: Usa folha A4 com duas colunas, cinco linhas e início do gabarito a 13 mm do topo.
 *     tags: [etiquetas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ordemTesteId]
 *             properties:
 *               ordemTesteId: { type: string, format: uuid }
 *               ticketIds:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PDF de tickets únicos gerado
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Planta não autorizada
 *       404:
 *         description: Ordem ou ticket não encontrado
 *       500:
 *         description: Falha ao gerar PDF
 */
router.post(
  '/tickets-setor',
  exigirAlgumaPermissao([
    'EDITAR_TELA_GESTAO_ORDENS', 'EDITAR_TELA_NOVA_ORDEM_TESTE', 'EDITAR_TELA_BIPAGEM',
  ]),
  gerarTicketsSetor,
);

router.post(
  '/tickets-corte',
  exigirAlgumaPermissao([
    'EDITAR_TELA_GESTAO_ORDENS', 'EDITAR_TELA_NOVA_ORDEM_TESTE', 'EDITAR_TELA_BIPAGEM',
  ]),
  gerarTicketsCorte,
);

router.post(
  '/tickets-ordem',
  exigirAlgumaPermissao([
    'EDITAR_TELA_GESTAO_ORDENS', 'EDITAR_TELA_NOVA_ORDEM_TESTE', 'EDITAR_TELA_BIPAGEM',
  ]),
  gerarTicketsCompletosDaOrdem,
);

export default router;
