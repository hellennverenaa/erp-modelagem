import { Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { EtiquetaService } from '../services/etiqueta.service';

const gerarEtiquetasSchema = z.object({
  ordemTesteIds: z.array(z.string().uuid({ message: 'Os IDs das ordens de teste devem ser UUIDs validos.' })).min(1, {
    message: 'Selecione ao menos uma ordem de teste para gerar etiquetas.'
  }),
  setorId: z.string().uuid({ message: 'O ID do setor deve ser um UUID valido.' })
});

export class EtiquetaController {
  private etiquetaService: EtiquetaService;

  constructor() {
    this.etiquetaService = new EtiquetaService();
  }

  /**
   * Endpoint para geracao do PDF de etiquetas de rastreamento (Code 128) formatado em folha A4.
   */
  public gerarEtiquetas = async (req: Request, res: Response): Promise<Response | void> => {
    try {
      // 1. Validacao do payload recebido no corpo da requisicao
      const parsedBody = gerarEtiquetasSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: 'Dados invalidos para geracao de etiquetas.',
          details: parsedBody.error.flatten(),
          code: 'ETIQUETA_VALIDATION_ERROR'
        });
      }

      const { ordemTesteIds } = parsedBody.data;

      // 2. Buscar as ordens de teste correspondentes com relacionamentos completos
      const ordemTesteRepo = AppDataSource.getRepository(OrdemTeste);
      const ordens = await ordemTesteRepo.find({
        where: { id: In(ordemTesteIds) },
        relations: {
          modelo: { marca: true },
          planta: true
        }
      });

      if (!ordens || ordens.length === 0) {
        return res.status(404).json({
          error: 'Nenhuma das ordens de teste informadas foi encontrada no banco de dados.',
          code: 'ETIQUETA_NOT_FOUND'
        });
      }

      // 3. Chamar o servico de etiquetas com Puppeteer
      const pdfBuffer = await this.etiquetaService.gerarEtiquetasPdf(ordens);

      // 4. Configurar headers e retornar o PDF como stream de bytes/buffer
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-rastreamento.pdf"');
      res.setHeader('Content-Length', pdfBuffer.length);
      
      return res.status(200).send(pdfBuffer);

    } catch (error: any) {
      console.error('[EtiquetaController] Falha ao processar impressao de etiquetas:', error);
      return res.status(500).json({
        error: 'Erro interno ao gerar etiquetas de rastreamento em PDF.',
        code: 'ETIQUETA_INTERNAL_ERROR',
        message: error.message
      });
    }
  };
}
