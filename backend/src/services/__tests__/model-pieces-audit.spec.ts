import { describe, expect, it, vi } from 'vitest';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../../entities/AuditLog';
import { CatalogoPeca } from '../../entities/CatalogoPeca';
import { ConfigOpcao } from '../../entities/ConfigOpcao';
import { Peca } from '../../entities/Peca';
import { saveModelPieces } from '../model-pieces.service';

const opcoes = [
  { id: 'opcao-lectra', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
  { id: 'opcao-ponte', valor: 'PONTE', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
];

function criarContexto(existing: any[], catalogoPecas: any[]) {
  const auditoriaRepo = {
    create: vi.fn((evento) => evento),
    save: vi.fn(async (evento) => evento),
  };
  const pecaRepo = {
    find: vi.fn().mockResolvedValue(existing),
    create: vi.fn((peca) => peca),
    save: vi.fn(async (pecas) => pecas),
  };
  const catalogoRepo = { find: vi.fn().mockResolvedValue(catalogoPecas) };
  const opcaoRepo = { find: vi.fn().mockResolvedValue(opcoes) };
  const manager = {
    getRepository: vi.fn((entity: any) => {
      if (entity === AuditLog) return auditoriaRepo;
      if (entity === Peca) return pecaRepo;
      if (entity === CatalogoPeca) return catalogoRepo;
      if (entity === ConfigOpcao) return opcaoRepo;
      throw new Error(`Repositório não configurado: ${entity.name}`);
    }),
  } as unknown as EntityManager;

  return { manager, auditoriaRepo };
}

describe('auditoria das peças do modelo', () => {
  it('registra diferenças antes/depois na transação da edição', async () => {
    const existing = [
      { id: 'peca-1', catalogoPecaId: 'catalogo-1', nome: 'BIQUEIRA', descricao: null, setorCorteOpcaoId: 'opcao-lectra' },
      { id: 'peca-2', catalogoPecaId: 'catalogo-2', nome: 'GASPEA', descricao: 'Atual', setorCorteOpcaoId: 'opcao-ponte' },
    ];
    const { manager, auditoriaRepo } = criarContexto(existing, [
      { id: 'catalogo-1', nome: 'BIQUEIRA', descricao: null },
      { id: 'catalogo-3', nome: 'VISTA', descricao: 'Nova' },
    ]);

    await saveModelPieces(manager, 'modelo-1', [
      { id: 'peca-1', catalogoPecaId: 'catalogo-1', setorCorteOpcaoId: 'opcao-lectra' },
      { id: 'peca-2', catalogoPecaId: 'catalogo-3', setorCorteOpcaoId: 'opcao-ponte' },
    ], { usuarioId: 'usuario-1', plantaId: 'planta-1', ipAddress: '127.0.0.1' });

    expect(auditoriaRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      acao: 'PECAS_MODELO_ALTERADAS',
      entidadeTipo: 'modelos',
      entidadeId: 'modelo-1',
      usuarioId: 'usuario-1',
      plantaId: 'planta-1',
      dadosAnteriores: { pecas: expect.arrayContaining([
        expect.objectContaining({ id: 'peca-2', catalogoPecaId: 'catalogo-2', nome: 'GASPEA' }),
      ]) },
      dadosNovos: { pecas: expect.arrayContaining([
        expect.objectContaining({ id: 'peca-2', catalogoPecaId: 'catalogo-3', nome: 'VISTA' }),
      ]) },
    }));
  });

  it('não grava evento quando a configuração das peças não mudou', async () => {
    const existing = [
      { id: 'peca-1', catalogoPecaId: 'catalogo-1', nome: 'BIQUEIRA', descricao: null, setorCorteOpcaoId: 'opcao-lectra' },
      { id: 'peca-2', catalogoPecaId: 'catalogo-2', nome: 'GASPEA', descricao: 'Atual', setorCorteOpcaoId: 'opcao-ponte' },
    ];
    const { manager, auditoriaRepo } = criarContexto(existing, [
      { id: 'catalogo-1', nome: 'BIQUEIRA', descricao: null },
      { id: 'catalogo-2', nome: 'GASPEA', descricao: 'Atual' },
    ]);

    await saveModelPieces(manager, 'modelo-1', [
      { id: 'peca-1', catalogoPecaId: 'catalogo-1', setorCorteOpcaoId: 'opcao-lectra' },
      { id: 'peca-2', catalogoPecaId: 'catalogo-2', setorCorteOpcaoId: 'opcao-ponte' },
    ], { usuarioId: 'usuario-1' });

    expect(auditoriaRepo.save).not.toHaveBeenCalled();
  });
});
