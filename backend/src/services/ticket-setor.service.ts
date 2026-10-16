import { EntityManager } from 'typeorm';
import { OrdemTeste } from '../entities/OrdemTeste';
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
  const tickets = [...etapasPorSetor.values()].map((etapa) => {
    const { id, codigoBarras } = TicketSetor.criarCodigoBarras();
    return ticketRepo.create({
      id,
      codigoBarras,
      ordemTesteId: ordem.id,
      setorId: etapa.setorId,
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
