import { Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { TipoLote } from '../entities/Rastreamento';
import { TicketSetor } from '../entities/TicketSetor';
import { EtiquetaService, EtiquetaDTO } from '../services/etiqueta.service';
import { perfilPossuiPermissao } from '../services/rbac.service';
import { garantirTicketsSetorDaOrdem } from '../services/ticket-setor.service';

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
  tipoLote: z.nativeEnum(TipoLote).optional(),
});

const gerarTicketsOrdemSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'O ID da ordem deve ser um UUID válido.' }),
});

const gerarTicketsCorteSchema = gerarTicketsOrdemSchema;

async function buscarOrdemAutorizada(req: Request, ordemTesteId: string, incluirPecas = false): Promise<OrdemTeste | null> {
  if (!req.user) return null;
  const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
  if (!acessoTodasPlantas && !req.user.plantaId) return null;

  return AppDataSource.getRepository(OrdemTeste).findOne({
    where: acessoTodasPlantas
      ? { id: ordemTesteId }
      : { id: ordemTesteId, plantaId: req.user.plantaId },
    relations: {
      modelo: incluirPecas ? { pecas: true } : true,
      planta: true,
    },
  });
}

function mapearTicketSetorParaEtiqueta(ticket: TicketSetor, ordem: OrdemTeste): EtiquetaDTO {
  return {
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
    tipoLote: ticket.tipoLote,
    tipoEtiqueta: 'SETOR',
    setorNome: ticket.setorNomeSnapshot,
    ordemEtapa: ticket.ordemEtapa,
    rotaVersao: ticket.rotaVersao,
    copias: 1,
  };
}

async function montarEtiquetasCorte(ordem: OrdemTeste): Promise<EtiquetaDTO[]> {
  const pecas = ordem.modelo?.pecas || [];
  if (pecas.length === 0) return [];

  const pecasPorSubsetor = new Map<string, typeof pecas>();
  for (const peca of pecas) {
    const subsetorId = ordem.pecasRemanejadas?.[peca.id] || peca.setorCorteOpcaoId || 'OUTROS';
    const grupo = pecasPorSubsetor.get(subsetorId) || [];
    grupo.push(peca);
    pecasPorSubsetor.set(subsetorId, grupo);
  }

  const subsetorIds = [...pecasPorSubsetor.keys()].filter((id) => id !== 'OUTROS');
  const opcoes = subsetorIds.length
    ? await AppDataSource.getRepository(ConfigOpcao).find({ where: { id: In(subsetorIds) } })
    : [];
  const nomePorId = new Map(opcoes.map((opcao) => [opcao.id, opcao.label || opcao.valor]));
  const etiquetas: EtiquetaDTO[] = [];
  const pecasPorTicket = 6;

  for (const [subsetorId, pecasDoGrupo] of pecasPorSubsetor) {
    const nomeOpcao = nomePorId.get(subsetorId) || 'Geral';
    const nomeCorte = nomeOpcao.toLowerCase().startsWith('corte ')
      ? nomeOpcao.replace(/^corte\s+/i, 'Corte — ')
      : `Corte — ${nomeOpcao}`;
    const totalPaginas = Math.ceil(pecasDoGrupo.length / pecasPorTicket);

    for (let pagina = 0; pagina < totalPaginas; pagina++) {
      const pecasChunk = pecasDoGrupo.slice(pagina * pecasPorTicket, (pagina + 1) * pecasPorTicket);
      const nomeGrupo = totalPaginas > 1 ? `${nomeCorte} (${pagina + 1}/${totalPaginas})` : nomeCorte;
      etiquetas.push({
        codigoPeca: 'TICKET DE CORTE',
        tamanho: 'U',
        quantidade: 1,
        modelo: ordem.modelo?.nome || 'MODELO DASS',
        versao: 'CORTE',
        produtoDescricao: `${ordem.modelo?.codigoProduto || ''} ${ordem.modelo?.nome || ''}`.trim(),
        ordemTeste: ordem.codigoBarras,
        pacote: '1',
        documento: 'PCP-DASS',
        semana: '00',
        material: 'N/D',
        itens: pecasChunk.map((peca) => peca.nome).join(' • '),
        talao: '1x1',
        codigoBarras: ordem.codigoBarras,
        plantaNome: ordem.planta?.nome || 'PLANTA DASS',
        tipoEtiqueta: 'CORTE',
        setorNome: nomeGrupo,
        detalhe: `Peças (${pecasChunk.length}): ${pecasChunk.map((peca) => peca.nome).join(' • ')}`,
        copias: 1,
      });
    }
  }

  return etiquetas;
}

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
    const ordem = await buscarOrdemAutorizada(req, parsedBody.data.ordemTesteId);

    if (!ordem) {
      return res.status(404).json({ error: 'Ordem de teste não encontrada.', code: 'LOTE_NOT_FOUND' });
    }

    if (!ordem.rotaSnapshot?.etapas?.length) {
      return res.status(409).json({ error: 'A rota da ordem ainda não foi congelada.', code: 'ROTA_NAO_CONGELADA' });
    }

    await AppDataSource.transaction((manager) => garantirTicketsSetorDaOrdem(manager, ordem));

    const whereTicket = {
      ordemTesteId: ordem.id,
      ...(parsedBody.data.ticketIds ? { id: In(parsedBody.data.ticketIds) } : {}),
      ...(parsedBody.data.tipoLote ? { tipoLote: parsedBody.data.tipoLote } : {}),
    };
    const ticketsEncontrados = await AppDataSource.getRepository(TicketSetor).find({
      where: whereTicket,
      relations: { setor: true },
      order: { ordemEtapa: 'ASC', createdAt: 'ASC' },
    });
    const tickets = ticketsEncontrados.filter((ticket) => ticket.setor?.ativo);

    if (parsedBody.data.ticketIds && tickets.length !== new Set(parsedBody.data.ticketIds).size) {
      return res.status(404).json({ error: 'Um ou mais tickets não pertencem a esta ordem.', code: 'TICKET_SETOR_NOT_FOUND' });
    }
    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Esta ordem ainda não possui tickets de setor.', code: 'TICKETS_SETOR_NOT_FOUND' });
    }

    const etiquetas = tickets.map((ticket) => mapearTicketSetorParaEtiqueta(ticket, ordem));

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

/** Gera somente os tickets agrupados dos subsetores de Corte da ordem. */
export const gerarTicketsCorte = async (req: Request, res: Response): Promise<Response | void> => {
  const parsedBody = gerarTicketsCorteSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Informe uma ordem válida.', code: 'ETIQUETA_VALIDATION_ERROR' });
  }
  if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });

  try {
    const ordem = await buscarOrdemAutorizada(req, parsedBody.data.ordemTesteId, true);
    if (!ordem) return res.status(404).json({ error: 'Ordem de teste não encontrada.', code: 'LOTE_NOT_FOUND' });

    const etiquetas = await montarEtiquetasCorte(ordem);
    if (etiquetas.length === 0) {
      return res.status(404).json({ error: 'A ordem não possui peças configuradas para o Corte.', code: 'TICKETS_CORTE_NOT_FOUND' });
    }

    const pdfBuffer = await EtiquetaService.gerarPdfEtiquetas(etiquetas);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="tickets-corte.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[EtiquetaController] Falha ao gerar tickets de Corte:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar tickets de Corte.', code: 'ETIQUETA_TICKETS_CORTE_ERROR' });
  }
};

/** Gera em um único PDF Lote Principal, Caixa Teste quando ativa e tickets de Corte. */
export const gerarTicketsCompletosDaOrdem = async (req: Request, res: Response): Promise<Response | void> => {
  const parsedBody = gerarTicketsOrdemSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Informe uma ordem válida.', code: 'ETIQUETA_VALIDATION_ERROR' });
  }
  if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });

  try {
    const ordem = await buscarOrdemAutorizada(req, parsedBody.data.ordemTesteId, true);
    if (!ordem) return res.status(404).json({ error: 'Ordem de teste não encontrada.', code: 'LOTE_NOT_FOUND' });
    if (!ordem.rotaSnapshot?.etapas?.length) {
      return res.status(409).json({ error: 'A rota da ordem ainda não foi congelada.', code: 'ROTA_NAO_CONGELADA' });
    }

    await AppDataSource.transaction((manager) => garantirTicketsSetorDaOrdem(manager, ordem));
    const tickets = await AppDataSource.getRepository(TicketSetor).find({
      where: { ordemTesteId: ordem.id },
      relations: { setor: true },
      order: { ordemEtapa: 'ASC', createdAt: 'ASC' },
    }).then((registros) => registros.filter((ticket) => ticket.setor?.ativo));
    const ticketsOrdenados = tickets.sort((a, b) => {
      const ordemFluxo = (a.tipoLote === TipoLote.LOTE_PRINCIPAL ? 0 : 1) - (b.tipoLote === TipoLote.LOTE_PRINCIPAL ? 0 : 1);
      return ordemFluxo || a.ordemEtapa - b.ordemEtapa;
    });
    const etiquetas = [
      ...ticketsOrdenados.map((ticket) => mapearTicketSetorParaEtiqueta(ticket, ordem)),
      ...await montarEtiquetasCorte(ordem),
    ];

    if (etiquetas.length === 0) {
      return res.status(404).json({ error: 'A ordem não possui tickets para impressão.', code: 'TICKETS_ORDEM_NOT_FOUND' });
    }

    const pdfBuffer = await EtiquetaService.gerarPdfEtiquetas(etiquetas);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="tickets-completos-da-ordem.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[EtiquetaController] Falha ao gerar tickets completos da ordem:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar tickets da ordem.', code: 'ETIQUETA_TICKETS_ORDEM_ERROR' });
  }
};
