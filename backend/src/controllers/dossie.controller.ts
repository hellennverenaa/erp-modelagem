import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { DossieModelo, DossieStatus } from '../entities/DossieModelo';
import { OrdemTeste } from '../entities/OrdemTeste';
import { triggerGeracaoDossie } from '../services/dossie.service';
import { z } from 'zod';
import fs from 'fs';

const gerarDossieSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'ordemTesteId deve ser um UUID válido.' })
});

export class DossieController {
  /**
   * POST /api/dossies/gerar
   * Registra a solicitação de dossiê, muda status para GERANDO, e aciona o processamento em background.
   */
  public gerarDossie = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      }

      const parseResult = gerarDossieSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de entrada inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const { ordemTesteId } = parseResult.data;

      // Busca a Ordem de Teste para obter o modeloId
      const otRepo = AppDataSource.getRepository(OrdemTeste);
      const testOrder = await otRepo.findOne({ where: { id: ordemTesteId } });
      if (!testOrder) {
        return res.status(404).json({ error: 'Ordem de Teste não encontrada.', code: 'ORDEM_TESTE_NOT_FOUND' });
      }

      const dossieRepo = AppDataSource.getRepository(DossieModelo);
      let dossie = await dossieRepo.findOne({ where: { ordemTesteId } });

      if (dossie) {
        // Se já existe, redefine para GERANDO e atualiza quem solicitou
        dossie.status = DossieStatus.GERANDO;
        dossie.geradoPorId = req.user.userId;
        dossie.metadadosCompilacao = null;
        dossie.geradoEm = null;
        dossie = await dossieRepo.save(dossie);
      } else {
        // Se é novo, cria o registro
        dossie = dossieRepo.create({
          ordemTesteId,
          modeloId: testOrder.modeloId,
          geradoPorId: req.user.userId,
          status: DossieStatus.GERANDO
        });
        dossie = await dossieRepo.save(dossie);
      }

      // Dispara geração do PDF em background
      triggerGeracaoDossie(dossie.id);

      return res.status(201).json({
        id: dossie.id,
        ordemTesteId: dossie.ordemTesteId,
        status: dossie.status,
        urlDocumento: `/api/dossies/download/${dossie.id}`,
        createdAt: dossie.createdAt,
        updatedAt: dossie.updatedAt
      });

    } catch (error) {
      console.error('[DossieController] Erro ao registrar dossiê:', error);
      return res.status(500).json({ error: 'Erro interno ao iniciar a geração do dossiê' });
    }
  };

  /**
   * GET /api/dossies/:id
   * Busca e retorna o registro do dossiê
   */
  public getDossieById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const dossieRepo = AppDataSource.getRepository(DossieModelo);
      const dossie = await dossieRepo.findOne({ where: { id: id as string } });

      if (!dossie) {
        return res.status(404).json({ error: 'Dossiê não encontrado.', code: 'DOSSIE_NOT_FOUND' });
      }

      return res.json({
        id: dossie.id,
        ordemTesteId: dossie.ordemTesteId,
        status: dossie.status,
        urlDocumento: dossie.caminhoPdf ? `/api/dossies/download/${dossie.id}` : null,
        tamanhoBytes: dossie.tamanhoBytes,
        geradoEm: dossie.geradoEm,
        createdAt: dossie.createdAt,
        updatedAt: dossie.updatedAt
      });
    } catch (error) {
      console.error('[DossieController] Erro ao buscar dossiê:', error);
      return res.status(500).json({ error: 'Erro ao buscar dossiê' });
    }
  };

  /**
   * GET /api/dossies/download/:id
   * Endpoint para download físico do PDF gerado
   */
  public downloadDossie = async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;
      const dossieRepo = AppDataSource.getRepository(DossieModelo);
      const dossie = await dossieRepo.findOne({ where: { id: id as string } });

      if (!dossie || !dossie.caminhoPdf) {
        return res.status(404).json({ error: 'Dossiê ou arquivo PDF ainda não disponível.', code: 'PDF_NOT_FOUND' });
      }

      if (!fs.existsSync(dossie.caminhoPdf)) {
        return res.status(404).json({ error: 'Arquivo físico do PDF não localizado no servidor.', code: 'FILE_NOT_FOUND' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=dossie_${dossie.ordemTesteId}.pdf`);
      return res.sendFile(dossie.caminhoPdf);
    } catch (error) {
      console.error('[DossieController] Erro ao efetuar download do PDF:', error);
      return res.status(500).json({ error: 'Erro ao efetuar download do PDF' });
    }
  };
}
