import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { OcorrenciaProducao, TipoOcorrencia, GravidadeOcorrencia, StatusOcorrencia } from '../entities/OcorrenciaProducao';
import { Anexo } from '../entities/Anexo';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Setor } from '../entities/Setor';

const criarOcorrenciaSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'ordemTesteId deve ser um UUID valido.' }),
  rastreamentoId: z.string().uuid({ message: 'rastreamentoId deve ser um UUID valido.' }).optional().nullable(),
  setorId: z.string().uuid({ message: 'setorId deve ser um UUID valido.' }),
  titulo: z.string().min(3, { message: 'O titulo deve conter pelo menos 3 caracteres.' }).max(200),
  descricao: z.string().min(5, { message: 'A descricao deve conter pelo menos 5 caracteres.' }),
  tipoOcorrencia: z.nativeEnum(TipoOcorrencia, { message: 'Tipo de ocorrencia invalido.' }),
  gravidade: z.nativeEnum(GravidadeOcorrencia, { message: 'Gravidade invalida.' }),
  interrompeSla: z.boolean().optional().default(false)
});

export class OcorrenciasController {
  public createOcorrencia = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuario nao autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      }

      const parseResult = criarOcorrenciaSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de ocorrencia invalidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const data = parseResult.data;

      const otRepo = AppDataSource.getRepository(OrdemTeste);
      const ot = await otRepo.findOneBy({ id: data.ordemTesteId });
      if (!ot) {
        return res.status(404).json({ error: 'Ordem de teste nao localizada.', code: 'ORDEM_NOT_FOUND' });
      }

      const setorRepo = AppDataSource.getRepository(Setor);
      const setor = await setorRepo.findOneBy({ id: data.setorId });
      if (!setor) {
        return res.status(404).json({ error: 'Setor nao localizado.', code: 'SETOR_NOT_FOUND' });
      }

      const ocorrencia = new OcorrenciaProducao();
      ocorrencia.ordemTesteId = data.ordemTesteId;
      ocorrencia.rastreamentoId = data.rastreamentoId || null;
      ocorrencia.setorId = data.setorId;
      ocorrencia.reportadoPorId = req.user.userId;
      ocorrencia.titulo = data.titulo;
      ocorrencia.descricao = data.descricao;
      ocorrencia.tipoOcorrencia = data.tipoOcorrencia;
      ocorrencia.gravidade = data.gravidade;
      ocorrencia.interrompeSla = data.interrompeSla;
      ocorrencia.status = StatusOcorrencia.ABERTA;
      ocorrencia.dataOcorrencia = new Date();

      const ocorrenciaRepo = AppDataSource.getRepository(OcorrenciaProducao);
      const ocorrenciaSalva = await ocorrenciaRepo.save(ocorrencia);

      return res.status(201).json(ocorrenciaSalva);
    } catch (error: any) {
      console.error('[OcorrenciasController] Erro ao criar ocorrencia:', error);
      return res.status(500).json({ error: 'Erro ao registrar ocorrencia de producao' });
    }
  };

  public getOcorrencias = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const ocorrenciaRepo = AppDataSource.getRepository(OcorrenciaProducao);
      const ocorrencias = await ocorrenciaRepo.find({
        relations: {
          ordemTeste: { modelo: true },
          setor: true,
          reportadoPor: true
        },
        order: { dataOcorrencia: 'DESC' }
      });
      return res.json(ocorrencias);
    } catch (error: any) {
      console.error('[OcorrenciasController] Erro ao buscar ocorrencias:', error);
      return res.status(500).json({ error: 'Erro ao buscar ocorrencias' });
    }
  };

  public resolverOcorrencia = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuario nao autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      }

      const id = req.params.id as string;
      const { resolucaoDescricao } = req.body;

      const ocorrenciaRepo = AppDataSource.getRepository(OcorrenciaProducao);
      const ocorrencia = await ocorrenciaRepo.findOneBy({ id });
      if (!ocorrencia) {
        return res.status(404).json({ error: 'Ocorrencia nao localizada.', code: 'OCORRENCIA_NOT_FOUND' });
      }

      ocorrencia.status = StatusOcorrencia.RESOLVIDA;
      ocorrencia.dataResolucao = new Date();
      ocorrencia.resolvidoPorId = req.user.userId;
      ocorrencia.resolucaoDescricao = resolucaoDescricao || 'Resolvido pelo operador';

      await ocorrenciaRepo.save(ocorrencia);

      return res.json(ocorrencia);
    } catch (error: any) {
      console.error('[OcorrenciasController] Erro ao resolver ocorrencia:', error);
      return res.status(500).json({ error: 'Erro ao resolver ocorrencia' });
    }
  };

  public uploadAnexo = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuario nao autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      }

      const id = req.params.id as string;
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.', code: 'FILE_MISSING' });
      }

      const ocorrenciaRepo = AppDataSource.getRepository(OcorrenciaProducao);
      const ocorrencia = await ocorrenciaRepo.findOneBy({ id });
      if (!ocorrencia) {
        return res.status(404).json({ error: 'Ocorrencia nao localizada para vincular anexo.', code: 'OCORRENCIA_NOT_FOUND' });
      }

      const anexo = new Anexo();
      anexo.entidadeTipo = 'ocorrencias_producao';
      anexo.entidadeId = id;
      anexo.nomeArquivo = req.file.originalname;
      anexo.caminhoArquivo = `uploads/${req.file.filename}`;
      anexo.tipoMime = req.file.mimetype;
      anexo.tamanhoBytes = req.file.size;
      anexo.uploadedPorId = req.user.userId;

      const anexoRepo = AppDataSource.getRepository(Anexo);
      const anexoSalvo = await anexoRepo.save(anexo);

      return res.status(201).json(anexoSalvo);
    } catch (error: any) {
      console.error('[OcorrenciasController] Erro ao fazer upload de anexo:', error);
      return res.status(500).json({ error: 'Erro ao realizar upload de foto' });
    }
  };
}
