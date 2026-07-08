import { Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { EtiquetaService, EtiquetaDTO } from '../services/etiqueta.service';

const gerarEtiquetasSchema = z.object({
  ordemTesteIds: z.array(z.string().uuid({ message: 'Os IDs das ordens de teste devem ser UUIDs validos.' })).min(1, {
    message: 'Selecione ao menos uma ordem de teste para gerar etiquetas.'
  }),
  setorId: z.string().uuid({ message: 'O ID do setor deve ser um UUID valido.' }),
  tipoLote: z.enum(['CAIXA_TESTE', 'LOTE_PRINCIPAL'] as const)
});

/**
 * Endpoint para impressão direta do PDF de etiquetas formatado a partir dos dados do DTO fornecidos pelo frontend.
 */
export const imprimirEtiquetas = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { etiquetas } = req.body;
    if (!etiquetas || !Array.isArray(etiquetas)) {
      return res.status(400).json({
        error: 'Dados invalidos para impressao de etiquetas.',
        code: 'ETIQUETA_VALIDATION_ERROR'
      });
    }

    const pdfBuffer = await EtiquetaService.gerarPdfEtiquetas(etiquetas);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error('[EtiquetaController] Falha ao processar impressao de etiquetas:', error);
    return res.status(500).json({
      error: 'Erro interno ao gerar etiquetas em PDF.',
      code: 'ETIQUETA_INTERNAL_ERROR',
      message: error.message
    });
  }
};

/**
 * Endpoint para geracao do PDF de etiquetas de rastreamento (Code 128) formatado em folha A4.
 */
export const gerarEtiquetas = async (req: Request, res: Response): Promise<Response | void> => {
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

    const { ordemTesteIds, tipoLote } = parsedBody.data;

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

    const sufixo = tipoLote === 'CAIXA_TESTE' ? '-CX' : '-LP';

    // 3. Mapear ordens para EtiquetaDTO[] para compatibilidade com o serviço
    const etiquetasDTO: EtiquetaDTO[] = ordens.map((ordem) => ({
      codigoPeca: 'PEÇA DE TESTE',
      tamanho: 'U',
      quantidade: 1,
      modelo: ordem.modelo?.nome || 'MODELO DASS',
      versao: 'VAP',
      produtoDescricao: `${ordem.modelo?.codigoProduto || ''} ${ordem.modelo?.nome || ''}`,
      ordemTeste: ordem.codigoBarras || '00000000',
      pacote: '1',
      documento: 'PCP-DASS',
      semana: '00',
      material: 'N/D',
      itens: 'N/A',
      talao: '1x1',
      codigoBarras: `${ordem.codigoBarras}${sufixo}`,
      possuiCaixaTeste: ordem.possuiCaixaTeste,
      plantaNome: ordem.planta?.nome || 'PLANTA DASS',
      tipoLote,
    }));

    // 4. Chamar o servico de etiquetas com Puppeteer
    const pdfBuffer = await EtiquetaService.gerarPdfEtiquetas(etiquetasDTO);

    // 5. Configurar headers e retornar o PDF como stream de bytes/buffer
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-rastreamento.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.status(200).send(pdfBuffer);

  } catch (error: any) {
    console.error('[EtiquetaController] Falha ao processar geracao de etiquetas:', error);
    return res.status(500).json({
      error: 'Erro interno ao gerar etiquetas de rastreamento em PDF.',
      code: 'ETIQUETA_INTERNAL_ERROR',
      message: error.message
    });
  }
};
