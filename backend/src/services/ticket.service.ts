import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { TicketSetor } from '../entities/TicketSetor';
import { garantirTicketsSetorDaOrdem } from './ticket-setor.service';

export class TicketServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'TICKET_ERROR'
  ) {
    super(message);
    this.name = 'TicketServiceError';
  }
}

export interface TicketSetorDTO {
  id: string;
  codigoBarras: string;
  setorId: string;
  tipoLote: string;
  ordemEtapa: number;
  rotaVersao: number;
  setorNomeSnapshot: string;
}

export interface RespostaTicketsOrdemDTO {
  ordemTesteId: string;
  codigoBarras: string;
  modeloNome: string;
  rotaCongelada: boolean;
  tickets: TicketSetorDTO[];
}

export interface RespostaTicketPorCodigoDTO {
  id: string;
  codigoBarras: string;
  ordemTesteId: string;
  ordemCodigoBarras: string;
  ordemStatus: string;
  possuiCaixaTeste: boolean;
  setorId: string;
  setorNome: string;
  tipoLote: string;
}

export class TicketService {
  /**
   * Obtém todos os tickets vinculados à ordem de teste.
   * Se a ordem possuir snapshot de rota, reconcilia os tickets ausentes de forma idempotente.
   */
  public static async obterTicketsOrdem(
    ordemId: string,
    usuarioPlantaId?: string,
    acessoTodasPlantas = false
  ): Promise<RespostaTicketsOrdemDTO> {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!ordemId || !uuidRegex.test(ordemId)) {
      throw new TicketServiceError('ID da ordem inválido.', 400, 'LOTE_ID_INVALIDO');
    }

    if (!acessoTodasPlantas && !usuarioPlantaId) {
      throw new TicketServiceError('Usuário sem planta associada.', 403, 'PLANTA_REQUIRED');
    }

    const ordem = await AppDataSource.getRepository(OrdemTeste).findOne({
      where: acessoTodasPlantas ? { id: ordemId } : { id: ordemId, plantaId: usuarioPlantaId },
      relations: { modelo: true },
    });

    if (!ordem) {
      throw new TicketServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND');
    }

    const rotaCongelada = Boolean(ordem.rotaSnapshot?.etapas?.length);
    if (rotaCongelada) {
      await AppDataSource.transaction(async (manager) => {
        await garantirTicketsSetorDaOrdem(manager, ordem);
      });
    }

    const tickets = await AppDataSource.getRepository(TicketSetor).find({
      where: { ordemTesteId: ordemId },
      relations: { setor: true },
      order: { ordemEtapa: 'ASC', createdAt: 'ASC' },
    }).then((registros) => registros.filter((ticket) => ticket.setor?.ativo));

    return {
      ordemTesteId: ordem.id,
      codigoBarras: ordem.codigoBarras,
      modeloNome: ordem.modelo?.nome ?? 'Modelo não informado',
      rotaCongelada,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        codigoBarras: ticket.codigoBarras,
        setorId: ticket.setorId,
        tipoLote: ticket.tipoLote,
        ordemEtapa: ticket.ordemEtapa,
        rotaVersao: ticket.rotaVersao,
        setorNomeSnapshot: ticket.setorNomeSnapshot,
      })),
    };
  }

  /**
   * Resolve e valida um ticket a partir do código de barras impresso/bipado.
   */
  public static async obterTicketPorCodigo(
    codigoBarrasRaw: string,
    usuarioPlantaId?: string,
    acessoTodasPlantas = false
  ): Promise<RespostaTicketPorCodigoDTO> {
    const codigoBarras = String(codigoBarrasRaw || '').trim().toUpperCase();
    if (!codigoBarras || codigoBarras.length > 64) {
      throw new TicketServiceError('Código do ticket inválido.', 400, 'TICKET_CODIGO_INVALIDO');
    }

    const ticket = await AppDataSource.getRepository(TicketSetor).findOne({
      where: { codigoBarras },
      relations: { ordemTeste: true, setor: true },
    });

    if (!ticket) {
      throw new TicketServiceError('Ticket de setor não encontrado.', 404, 'TICKET_SETOR_NOT_FOUND');
    }

    if (!ticket.setor?.ativo) {
      throw new TicketServiceError('Ticket de setor não encontrado.', 404, 'TICKET_SETOR_NOT_FOUND');
    }

    if (!acessoTodasPlantas && ticket.ordemTeste.plantaId !== usuarioPlantaId) {
      throw new TicketServiceError('Ticket de setor não encontrado.', 404, 'TICKET_SETOR_NOT_FOUND');
    }

    if (ticket.tipoLote === 'CAIXA_TESTE' && !ticket.ordemTeste.possuiCaixaTeste) {
      throw new TicketServiceError('A ordem não possui Caixa Teste ativa.', 409, 'CAIXA_TESTE_INATIVA');
    }

    return {
      id: ticket.id,
      codigoBarras: ticket.codigoBarras,
      ordemTesteId: ticket.ordemTesteId,
      ordemCodigoBarras: ticket.ordemTeste.codigoBarras,
      ordemStatus: ticket.ordemTeste.status,
      possuiCaixaTeste: Boolean(ticket.ordemTeste.possuiCaixaTeste),
      setorId: ticket.setorId,
      setorNome: ticket.setorNomeSnapshot,
      tipoLote: ticket.tipoLote,
    };
  }
}
