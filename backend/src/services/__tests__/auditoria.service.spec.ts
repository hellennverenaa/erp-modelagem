import { describe, expect, it, vi } from 'vitest';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../../entities/AuditLog';
import { registrarAuditoria } from '../auditoria.service';

describe('registrarAuditoria', () => {
  it('grava o evento no manager recebido e normaliza contexto opcional', async () => {
    const evento = {
      acao: 'MODELO_CRIADO',
      entidadeTipo: 'modelos',
      entidadeId: 'modelo-1',
      dadosAnteriores: null,
      dadosNovos: { nome: 'Modelo de teste' },
      usuarioId: 'usuario-1',
    };
    const logCriado = { ...evento, plantaId: null, ipAddress: null };
    const repository = {
      create: vi.fn().mockReturnValue(logCriado),
      save: vi.fn().mockResolvedValue(logCriado),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(repository),
    } as unknown as EntityManager;

    const resultado = await registrarAuditoria(manager, evento);

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    expect(repository.create).toHaveBeenCalledWith(logCriado);
    expect(repository.save).toHaveBeenCalledWith(logCriado);
    expect(resultado).toBe(logCriado);
  });
});
