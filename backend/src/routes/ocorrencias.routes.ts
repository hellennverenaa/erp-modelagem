import { Router } from 'express';
import { OcorrenciasController } from '../controllers/ocorrencias.controller';
import { upload } from '../middlewares/upload.middleware';

const router = Router();
const ocorrenciasController = new OcorrenciasController();

/**
 * @swagger
 * /api/ocorrencias:
 *   post:
 *     summary: Registra um novo gargalo ou ocorrência de produção
 *     description: Permite relatar problemas, atrasos ou paradas de máquina com a severidade do gargalo.
 *     tags:
 *       - ocorrencias
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
 *               - tipoOcorrencia
 *               - gravidade
 *               - descricao
 *             properties:
 *               ordemTesteId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               setorId:
 *                 type: string
 *                 format: uuid
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               tipoOcorrencia:
 *                 type: string
 *                 enum: [GARGALO_MAQUINA, FALTA_MATERIAL, PROBLEMA_QUALIDADE, BLOQUEIO_PROCESSO, ACIDENTE_TRABALHO, OUTRO]
 *                 example: "GARGALO_MAQUINA"
 *               gravidade:
 *                 type: string
 *                 enum: [BAIXA, MEDIA, ALTA, CRITICA]
 *                 example: "ALTA"
 *               descricao:
 *                 type: string
 *                 example: "Queda de rendimento da prensa de vulcanização"
 *     responses:
 *       201:
 *         description: Ocorrência cadastrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string, example: "ABERTA" }
 *       400:
 *         description: Dados inconsistentes
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', ocorrenciasController.createOcorrencia);

/**
 * @swagger
 * /api/ocorrencias/{id}/anexos:
 *   post:
 *     summary: Faz o upload de uma foto para a ocorrência
 *     description: Salva a foto no servidor e vincula como anexo à ocorrência de produção.
 *     tags:
 *       - ocorrencias
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Foto salva com sucesso
 *       400:
 *         description: Arquivo inválido ou ausente
 *       404:
 *         description: Ocorrência não encontrada
 *       500:
 *         description: Erro no upload
 */
router.post('/:id/anexos', upload.single('file'), ocorrenciasController.uploadAnexo);

/**
 * @swagger
 * /api/ocorrencias:
 *   get:
 *     summary: Retorna a lista de todas as ocorrências de produção ativas
 *     description: Lista todas as falhas operacionais e gargalos em aberto no chão de fábrica.
 *     tags:
 *       - ocorrencias
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ocorrências retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   ordemTesteId: { type: string, format: uuid }
 *                   setorId: { type: string, format: uuid }
 *                   tipoOcorrencia: { type: string }
 *                   gravidade: { type: string }
 *                   status: { type: string }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', ocorrenciasController.getOcorrencias);

/**
 * @swagger
 * /api/ocorrencias/{id}/resolver:
 *   put:
 *     summary: Finaliza e encerra o status de uma ocorrência
 *     description: Registra a solução de um gargalo ou falha de produção, fechando a ocorrência.
 *     tags:
 *       - ocorrencias
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da ocorrência de produção
 *     responses:
 *       200:
 *         description: Ocorrência resolvida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string, example: "RESOLVIDA" }
 *       401:
 *         description: Token JWT inválido ou ausente
 *       404:
 *         description: Ocorrência não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:id/resolver', ocorrenciasController.resolverOcorrencia);

export default router;
