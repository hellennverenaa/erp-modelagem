import { Router } from 'express';
import { RastreamentosController } from '../controllers/rastreamentos.controller';
import { verificarPermissaoSetor } from '../middlewares/rbac.middleware';

const router = Router();
const rastreamentosController = new RastreamentosController();

/**
 * @swagger
 * /api/rastreamentos/bipar-entrada:
 *   post:
 *     summary: Registra a bipagem de entrada em um setor
 *     description: |
 *       Cria um registro de rastreamento com data de entrada correspondente ao momento
 *       da requisição. Valida a permissão BIPAR_ENTRADA via RBAC dinâmico (tabela
 *       perfil_permissoes). Zero hardcode de roles ou setores.
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
 *                 description: UUID da Ordem de Teste
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440001"
 *                 description: UUID do Setor destino da bipagem
 *               tipoLote:
 *                 type: string
 *                 enum: [LOTE_PRINCIPAL, CAIXA_TESTE]
 *                 example: "LOTE_PRINCIPAL"
 *               pecaId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *                 description: UUID da Peça (null = ordem inteira/lote pós-corte)
 *               estacaoId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *                 description: UUID da Estação de Trabalho/Máquina
 *     responses:
 *       201:
 *         description: Bipagem de entrada registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bipagem de entrada registrada com sucesso."
 *                 rastreamento:
 *                   $ref: '#/components/schemas/Rastreamento'
 *       400:
 *         description: Dados de entrada inválidos (schema Zod)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Token JWT ausente ou inválido
 *       403:
 *         description: Permissão BIPAR_ENTRADA negada para este perfil/setor
 *       409:
 *         description: Já existe bipagem de entrada ativa para este setor/lote
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/bipar-entrada',
  verificarPermissaoSetor('BIPAR_ENTRADA', 'body'),
  rastreamentosController.biparEntrada
);

/**
 * @swagger
 * /api/rastreamentos/bipar-saida:
 *   post:
 *     summary: Registra a bipagem de saída com Gate de Qualidade Seletiva
 *     description: |
 *       Finaliza o rastreamento ativo calculando SLA dinâmico (descontando pausas
 *       por ocorrências com interrompeSla=true). Aplica o Gate de Qualidade Seletiva:
 *
 *       **Categoria A — Handoff Automático** (Almoxarifado, Navalha, Telas, Recebimento,
 *       Separação, Dublagem): valida checklist. Se bloqueante + COM_PENDENCIAS → bloqueia.
 *       Se não-bloqueante + COM_PENDENCIAS → concessão com alerta.
 *
 *       **Categoria B — Gate Obrigatório** (demais setores): exige inspeção com resultado
 *       APROVADO ou APROVADO_CONCESSAO (tipo SAIDA_SETOR, LABORATORIO ou LABORATORIO_APOIO).
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
 *                 example: "550e8400-e29b-41d4-a716-446655440001"
 *               tipoLote:
 *                 type: string
 *                 enum: [LOTE_PRINCIPAL, CAIXA_TESTE]
 *                 default: LOTE_PRINCIPAL
 *                 example: "LOTE_PRINCIPAL"
 *               inspecaoSaidaId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *                 description: UUID da inspeção que liberou a saída (Categoria B)
 *     responses:
 *       200:
 *         description: Bipagem de saída registrada com sucesso (handoff concluído)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 rastreamento:
 *                   $ref: '#/components/schemas/Rastreamento'
 *                 sla:
 *                   type: object
 *                   properties:
 *                     tempoTotalMin:
 *                       type: integer
 *                       description: Tempo total bruto em minutos
 *                     tempoPausadoMin:
 *                       type: integer
 *                       description: Tempo pausado por ocorrências (interrompeSla=true)
 *                     tempoPermanenciaMin:
 *                       type: integer
 *                       description: SLA real (bruto menos pausas)
 *                     ocorrenciasPausadoras:
 *                       type: integer
 *                       description: Quantidade de ocorrências que interromperam o SLA
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Token JWT ausente ou inválido
 *       403:
 *         description: Permissão negada (RBAC) ou Gate de Qualidade bloqueado
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "Bipagem travada por pendências bloqueantes no checklist."
 *                     code:
 *                       type: string
 *                       example: "CHECKLIST_BLOQUEANTE"
 *                 - type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "Saída bloqueada. Este setor exige inspeção de qualidade aprovada."
 *                     code:
 *                       type: string
 *                       example: "GATE_QUALIDADE_OBRIGATORIO"
 *       404:
 *         description: Bipagem de entrada ativa não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/bipar-saida',
  verificarPermissaoSetor('BIPAR_SAIDA', 'body'),
  rastreamentosController.biparSaida
);

/**
 * @swagger
 * /api/rastreamentos/historico/{ordemTesteId}:
 *   get:
 *     summary: Retorna o histórico de movimentação de uma Ordem de Teste
 *     description: |
 *       Lista cronologicamente todas as bipagens (passagens por setores) de uma
 *       ordem de teste, enriquecida com o tipo de setor (config_opcoes) para
 *       exibição no dashboard gerencial.
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
 *         description: UUID da Ordem de Teste
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Histórico de rastreamento retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ordemTesteId:
 *                   type: string
 *                   format: uuid
 *                 total:
 *                   type: integer
 *                 historico:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Rastreamento'
 *       400:
 *         description: ordemTesteId inválido
 *       401:
 *         description: Token JWT ausente ou inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/historico/:ordemTesteId', rastreamentosController.getHistorico);

export default router;
