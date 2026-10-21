import { EntityManager } from 'typeorm';
import { AuditLog } from '../entities/AuditLog';

export interface ContextoAuditoria {
  usuarioId?: string | null;
  plantaId?: string | null;
  ipAddress?: string | null;
}

export interface EventoAuditoriaInput extends ContextoAuditoria {
  acao: string;
  entidadeTipo: string;
  entidadeId: string;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
}

/** Persiste o evento no mesmo EntityManager da alteração de negócio. */
export async function registrarAuditoria(
  manager: EntityManager,
  evento: EventoAuditoriaInput,
): Promise<AuditLog> {
  const repository = manager.getRepository(AuditLog);
  return repository.save(repository.create({
    usuarioId: evento.usuarioId ?? null,
    plantaId: evento.plantaId ?? null,
    ipAddress: evento.ipAddress ?? null,
    acao: evento.acao,
    entidadeTipo: evento.entidadeTipo,
    entidadeId: evento.entidadeId,
    dadosAnteriores: evento.dadosAnteriores,
    dadosNovos: evento.dadosNovos,
  }));
}
