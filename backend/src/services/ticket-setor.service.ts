import { EntityManager } from 'typeorm';
import { OrdemTeste } from '../entities/OrdemTeste';
import { TipoLote } from '../entities/Rastreamento';
import { TicketSetor } from '../entities/TicketSetor';

/** Garante um ticket estável por setor da rota congelada da ordem. */
export async function garantirTicketsSetorDaOrdem(manager: EntityManager, ordem: OrdemTeste): Promise<void> {
  const snapshot = ordem.rotaSnapshot;
  if (!snapshot || snapshot.etapas.length === 0) {
    throw new Error(`A ordem ${ordem.id} não possui etapas no snapshot da rota para gerar tickets.`);
  }

  const etapasPorSetor = new Map<string, (typeof snapshot.etapas)[number]>();
  for (const etapa of snapshot.etapas) {
    if (!etapasPorSetor.has(etapa.setorId)) etapasPorSetor.set(etapa.setorId, etapa);
  }

  const ticketRepo = manager.getRepository(TicketSetor);
  const tiposLote: TipoLote[] = [TipoLote.LOTE_PRINCIPAL];
  if (ordem.possuiCaixaTeste) tiposLote.push(TipoLote.CAIXA_TESTE);

  const ticketsExistentes = await ticketRepo.find({
    where: { ordemTesteId: ordem.id },
    select: { setorId: true, tipoLote: true },
  });
  const ticketsExistentesPorChave = new Set(
    ticketsExistentes.map((ticket) => `${ticket.setorId}:${ticket.tipoLote}`),
  );
  const etapasSemTicket = [...etapasPorSetor.values()].flatMap((etapa) =>
    tiposLote
      .filter((tipoLote) => !ticketsExistentesPorChave.has(`${etapa.setorId}:${tipoLote}`))
      .map((tipoLote) => ({ etapa, tipoLote })),
  );
  if (etapasSemTicket.length === 0) return;

  const tickets = etapasSemTicket.map(({ etapa, tipoLote }) => {
    const { id, codigoBarras } = TicketSetor.criarCodigoBarras(undefined, tipoLote);
    return ticketRepo.create({
      id,
      codigoBarras,
      ordemTesteId: ordem.id,
      setorId: etapa.setorId,
      tipoLote,
      rotaVersao: snapshot.versao,
      ordemEtapa: etapa.ordem,
      setorNomeSnapshot: etapa.nome,
    });
  });

  await ticketRepo.createQueryBuilder()
    .insert()
    .values(tickets)
    .orIgnore()
    .execute();
}
