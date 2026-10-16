import { Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { TicketSetor } from '../entities/TicketSetor';
import { EtiquetaService, EtiquetaDTO } from '../services/etiqueta.service';
import { perfilPossuiPermissao } from '../services/rbac.service';

const gerarEtiquetasSchema = z.object({
  ordemTesteIds: z.array(z.string().uuid({ message: 'Os IDs das ordens de teste devem ser UUIDs validos.' })).min(1, {
    message: 'Selecione ao menos uma ordem de teste para gerar etiquetas.'
  }),
  setorId: z.string().uuid({ message: 'O ID do setor deve ser um UUID valido.' }),
  tipoLote: z.enum(['CAIXA_TESTE', 'LOTE_PRINCIPAL'] as const)
});

const gerarTicketsSetorSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'O ID da ordem deve ser um UUID válido.' }),
  ticketIds: z.array(z.string().uuid({ message: 'Os IDs dos tickets devem ser UUIDs válidos.' })).min(1).optional(),
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
      possuiCaixaTeste: Boolean(ordem.possuiCaixaTeste),
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

/** Gera uma etiqueta por ticket de setor no gabarito físico A4 de 2×5 etiquetas. */
export const gerarTicketsSetor = async (req: Request, res: Response): Promise<Response | void> => {
  const parsedBody = gerarTicketsSetorSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: 'Informe uma ordem e tickets de setor válidos.',
      code: 'ETIQUETA_VALIDATION_ERROR',
      details: parsedBody.error.flatten(),
    });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
  }

  try {
    const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
    if (!acessoTodasPlantas && !req.user.plantaId) {
      return res.status(403).json({ error: 'Usuário sem planta associada.', code: 'PLANTA_REQUIRED' });
    }

    const ordemRepo = AppDataSource.getRepository(OrdemTeste);
    const ordem = await ordemRepo.findOne({
      where: acessoTodasPlantas
        ? { id: parsedBody.data.ordemTesteId }
        : { id: parsedBody.data.ordemTesteId, plantaId: req.user.plantaId },
      relations: { modelo: true, planta: true },
    });

    if (!ordem) {
      return res.status(404).json({ error: 'Ordem de teste não encontrada.', code: 'LOTE_NOT_FOUND' });
    }

    const whereTicket: { ordemTesteId: string; id?: ReturnType<typeof In<string>> } = {
      ordemTesteId: ordem.id,
      ...(parsedBody.data.ticketIds ? { id: In(parsedBody.data.ticketIds) } : {}),
    };
    const tickets = await AppDataSource.getRepository(TicketSetor).find({
      where: whereTicket,
      order: { ordemEtapa: 'ASC', createdAt: 'ASC' },
    });

    if (parsedBody.data.ticketIds && tickets.length !== new Set(parsedBody.data.ticketIds).size) {
      return res.status(404).json({ error: 'Um ou mais tickets não pertencem a esta ordem.', code: 'TICKET_SETOR_NOT_FOUND' });
    }
    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Esta ordem ainda não possui tickets de setor.', code: 'TICKETS_SETOR_NOT_FOUND' });
    }

    const etiquetas: EtiquetaDTO[] = tickets.map((ticket) => ({
      codigoPeca: 'TICKET DE SETOR',
      tamanho: 'U',
      quantidade: 1,
      modelo: ordem.modelo?.nome || 'MODELO DASS',
      versao: `ROTA ${ticket.rotaVersao}`,
      produtoDescricao: `${ordem.modelo?.codigoProduto || ''} ${ordem.modelo?.nome || ''}`.trim(),
      ordemTeste: ordem.codigoBarras,
      pacote: '1',
      documento: 'PCP-DASS',
      semana: '00',
      material: 'N/D',
      itens: 'N/A',
      talao: '1x1',
      codigoBarras: ticket.codigoBarras,
      plantaNome: ordem.planta?.nome || 'PLANTA DASS',
      tipoEtiqueta: 'SETOR',
      setorNome: ticket.setorNomeSnapshot,
      ordemEtapa: ticket.ordemEtapa,
      rotaVersao: ticket.rotaVersao,
      copias: 1,
    }));

    const pdfBuffer = await EtiquetaService.gerarPdfEtiquetas(etiquetas);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="tickets-setor.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error('[EtiquetaController] Falha ao gerar tickets por setor:', error);
    return res.status(500).json({
      error: 'Erro interno ao gerar tickets de setor em PDF.',
      code: 'ETIQUETA_TICKETS_SETOR_ERROR',
    });
  }
};
