import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateRouteIntegrity, RouteIntegrityError, RotaEtapaInput, PecaCorteInput } from '../route-integrity.service';
import { EntityManager } from 'typeorm';
import { ConfigOpcao } from '../../entities/ConfigOpcao';
import { Setor } from '../../entities/Setor';
import { Planta } from '../../entities/Planta';

describe('validateRouteIntegrity - Regras de Validação de Rota e Peças de Corte', () => {
  let mockManager: EntityManager;
  let mockOpcoesRepo: any;
  let mockSetorRepo: any;
  let mockPlantaRepo: any;

  beforeEach(() => {
    mockOpcoesRepo = {
      find: vi.fn(),
    };
    mockSetorRepo = {
      find: vi.fn(),
    };
    mockPlantaRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'planta-1', ativo: true }),
    };

    mockManager = {
      getRepository: vi.fn((entity: any) => {
        if (entity === ConfigOpcao) return mockOpcoesRepo;
        if (entity === Setor) return mockSetorRepo;
        if (entity === Planta) return mockPlantaRepo;
        throw new Error(`Repositório não mockado para ${entity.name}`);
      }),
    } as unknown as EntityManager;
  });

  it('deve rejeitar rota vazia ou peças vazias', async () => {
    await expect(validateRouteIntegrity(mockManager, [], [{ setorCorteOpcaoId: 'opt-1' }]))
      .rejects
      .toThrow(new RouteIntegrityError('Cadastre peças e construa a rota antes de criar a ordem.'));

    await expect(validateRouteIntegrity(mockManager, [{ setorId: 's-1', ordem: 1 }], []))
      .rejects
      .toThrow(new RouteIntegrityError('Cadastre peças e construa a rota antes de criar a ordem.'));
  });

  it('deve rejeitar peça sem setor de corte', async () => {
    const pecas: PecaCorteInput[] = [{ setorCorteOpcaoId: '' }];
    const rota: RotaEtapaInput[] = [{ setorId: 's-1', ordem: 1 }];

    await expect(validateRouteIntegrity(mockManager, rota, pecas))
      .rejects
      .toThrow(new RouteIntegrityError('Todas as peças precisam de um sub-setor de corte.'));
  });

  it('deve rejeitar se categoria do sub-setor não for subsetor_corte ou inativa', async () => {
    const pecas: PecaCorteInput[] = [{ setorCorteOpcaoId: 'opt-invalid' }];
    const rota: RotaEtapaInput[] = [{ setorId: 's-1', ordem: 1 }];

    mockOpcoesRepo.find.mockResolvedValueOnce([
      {
        id: 'opt-invalid',
        valor: 'OUTRO',
        ativo: true,
        categoria: { slug: 'categoria_incorreta', ativo: true }
      }
    ]);

    await expect(validateRouteIntegrity(mockManager, rota, pecas))
      .rejects
      .toThrow(new RouteIntegrityError('Uma ou mais peças usam um sub-setor de corte inválido.'));
  });

  it('deve rejeitar se plantaId fornecido for inativo ou inexistente', async () => {
    const pecas: PecaCorteInput[] = [
      { setorCorteOpcaoId: 'opt-lectra' },
      { setorCorteOpcaoId: 'opt-ponte' }
    ];
    const rota: RotaEtapaInput[] = [{ setorId: 's-1', ordem: 1 }];

    mockOpcoesRepo.find.mockResolvedValueOnce([
      { id: 'opt-lectra', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
      { id: 'opt-ponte', valor: 'PONTE', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
    ]);
    mockPlantaRepo.findOne.mockResolvedValueOnce(null);

    await expect(validateRouteIntegrity(mockManager, rota, pecas, 'planta-999'))
      .rejects
      .toThrow(new RouteIntegrityError('A planta da rota não existe ou está inativa.', 'ROUTE_PLANT_MISMATCH'));
  });

  it('deve exigir obrigatoriamente ao menos uma peça em LECTRA e uma em PONTE', async () => {
    const pecas: PecaCorteInput[] = [
      { setorCorteOpcaoId: 'opt-lectra-only' }
    ];
    const rota: RotaEtapaInput[] = [{ setorId: 's-1', ordem: 1 }];

    mockOpcoesRepo.find.mockResolvedValueOnce([
      { id: 'opt-lectra-only', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } }
    ]);

    await expect(validateRouteIntegrity(mockManager, rota, pecas))
      .rejects
      .toThrow(new RouteIntegrityError('Cadastre ao menos uma peça em Lectra e uma em Ponte.'));
  });

  it('deve validar com sucesso quando rota contiver todos os setores obrigatórios e corte compatível', async () => {
    const pecas: PecaCorteInput[] = [
      { setorCorteOpcaoId: 'opt-lectra' },
      { setorCorteOpcaoId: 'opt-ponte' }
    ];

    mockOpcoesRepo.find
      .mockResolvedValueOnce([
        { id: 'opt-lectra', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
        { id: 'opt-ponte', valor: 'PONTE', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
      ])
      // Segunda chamada: tipos de setores da rota
      .mockResolvedValueOnce([
        { id: 't-almox', valor: 'ALMOXARIFADO_MODELAGEM' },
        { id: 't-navalha', valor: 'NAVALHA' },
        { id: 't-corte-rec', valor: 'CORTE_RECEBIMENTO' },
        { id: 't-corte-sep', valor: 'CORTE_SEPARACAO' },
        { id: 't-corte-dub', valor: 'CORTE_DUBLAGEM' },
        { id: 't-corte-ponte', valor: 'CORTE_PONTE' },
        { id: 't-corte-lectra', valor: 'CORTE_LECTRA' },
        { id: 't-apoio', valor: 'APOIO' },
        { id: 't-costura', valor: 'COSTURA' },
        { id: 't-montagem', valor: 'MONTAGEM' },
        { id: 't-lab', valor: 'LABORATORIO' },
      ]);

    const setoresMock = [
      { id: 's-1', plantaId: 'planta-1', tipoOpcaoId: 't-almox', ativo: true },
      { id: 's-2', plantaId: 'planta-1', tipoOpcaoId: 't-navalha', ativo: true },
      { id: 's-3', plantaId: 'planta-1', tipoOpcaoId: 't-corte-rec', ativo: true },
      { id: 's-4', plantaId: 'planta-1', tipoOpcaoId: 't-corte-sep', ativo: true },
      { id: 's-5', plantaId: 'planta-1', tipoOpcaoId: 't-corte-dub', ativo: true },
      { id: 's-6', plantaId: 'planta-1', tipoOpcaoId: 't-corte-ponte', ativo: true },
      { id: 's-7', plantaId: 'planta-1', tipoOpcaoId: 't-corte-lectra', ativo: true },
      { id: 's-8', plantaId: 'planta-1', tipoOpcaoId: 't-apoio', ativo: true },
      { id: 's-9', plantaId: 'planta-1', tipoOpcaoId: 't-costura', ativo: true },
      { id: 's-10', plantaId: 'planta-1', tipoOpcaoId: 't-montagem', ativo: true },
      { id: 's-11', plantaId: 'planta-1', tipoOpcaoId: 't-lab', ativo: true },
    ];

    mockSetorRepo.find.mockResolvedValueOnce(setoresMock);

    const rota: RotaEtapaInput[] = setoresMock.map((s, idx) => ({ setorId: s.id, ordem: idx + 1 }));

    await expect(validateRouteIntegrity(mockManager, rota, pecas, 'planta-1'))
      .resolves
      .toBeUndefined();
  });

  it('deve rejeitar se TELAS estiver presente sem SERIGRAFIA', async () => {
    const pecas: PecaCorteInput[] = [
      { setorCorteOpcaoId: 'opt-lectra' },
      { setorCorteOpcaoId: 'opt-ponte' }
    ];

    mockOpcoesRepo.find
      .mockResolvedValueOnce([
        { id: 'opt-lectra', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
        { id: 'opt-ponte', valor: 'PONTE', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
      ])
      .mockResolvedValueOnce([
        { id: 't-almox', valor: 'ALMOXARIFADO_MODELAGEM' },
        { id: 't-navalha', valor: 'NAVALHA' },
        { id: 't-corte-rec', valor: 'CORTE_RECEBIMENTO' },
        { id: 't-corte-sep', valor: 'CORTE_SEPARACAO' },
        { id: 't-corte-dub', valor: 'CORTE_DUBLAGEM' },
        { id: 't-corte-ponte', valor: 'CORTE_PONTE' },
        { id: 't-corte-lectra', valor: 'CORTE_LECTRA' },
        { id: 't-apoio', valor: 'APOIO' },
        { id: 't-costura', valor: 'COSTURA' },
        { id: 't-montagem', valor: 'MONTAGEM' },
        { id: 't-lab', valor: 'LABORATORIO' },
        { id: 't-telas', valor: 'TELAS' }, // Sem SERIGRAFIA!
      ]);

    const setoresMock = [
      { id: 's-1', plantaId: 'planta-1', tipoOpcaoId: 't-almox', ativo: true },
      { id: 's-2', plantaId: 'planta-1', tipoOpcaoId: 't-navalha', ativo: true },
      { id: 's-3', plantaId: 'planta-1', tipoOpcaoId: 't-corte-rec', ativo: true },
      { id: 's-4', plantaId: 'planta-1', tipoOpcaoId: 't-corte-sep', ativo: true },
      { id: 's-5', plantaId: 'planta-1', tipoOpcaoId: 't-corte-dub', ativo: true },
      { id: 's-6', plantaId: 'planta-1', tipoOpcaoId: 't-corte-ponte', ativo: true },
      { id: 's-7', plantaId: 'planta-1', tipoOpcaoId: 't-corte-lectra', ativo: true },
      { id: 's-8', plantaId: 'planta-1', tipoOpcaoId: 't-apoio', ativo: true },
      { id: 's-9', plantaId: 'planta-1', tipoOpcaoId: 't-costura', ativo: true },
      { id: 's-10', plantaId: 'planta-1', tipoOpcaoId: 't-montagem', ativo: true },
      { id: 's-11', plantaId: 'planta-1', tipoOpcaoId: 't-lab', ativo: true },
      { id: 's-12', plantaId: 'planta-1', tipoOpcaoId: 't-telas', ativo: true },
    ];

    mockSetorRepo.find.mockResolvedValueOnce(setoresMock);

    const rota: RotaEtapaInput[] = setoresMock.map((s, idx) => ({ setorId: s.id, ordem: idx + 1 }));

    await expect(validateRouteIntegrity(mockManager, rota, pecas, 'planta-1'))
      .rejects
      .toThrow(new RouteIntegrityError('O setor Telas deve estar presente somente quando Serigrafia estiver ativa.'));
  });

  it('deve rejeitar se sub-setor de corte estiver na rota sem ter peças vinculadas', async () => {
    const pecas: PecaCorteInput[] = [
      { setorCorteOpcaoId: 'opt-lectra' },
      { setorCorteOpcaoId: 'opt-ponte' }
      // NÃO temos peças vinculadas a CORTE_LASER
    ];

    mockOpcoesRepo.find
      .mockResolvedValueOnce([
        { id: 'opt-lectra', valor: 'LECTRA', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
        { id: 'opt-ponte', valor: 'PONTE', ativo: true, categoria: { slug: 'subsetor_corte', ativo: true } },
      ])
      .mockResolvedValueOnce([
        { id: 't-almox', valor: 'ALMOXARIFADO_MODELAGEM' },
        { id: 't-navalha', valor: 'NAVALHA' },
        { id: 't-corte-rec', valor: 'CORTE_RECEBIMENTO' },
        { id: 't-corte-sep', valor: 'CORTE_SEPARACAO' },
        { id: 't-corte-dub', valor: 'CORTE_DUBLAGEM' },
        { id: 't-corte-ponte', valor: 'CORTE_PONTE' },
        { id: 't-corte-lectra', valor: 'CORTE_LECTRA' },
        { id: 't-corte-laser', valor: 'CORTE_LASER' }, // Na rota, mas sem peças!
        { id: 't-apoio', valor: 'APOIO' },
        { id: 't-costura', valor: 'COSTURA' },
        { id: 't-montagem', valor: 'MONTAGEM' },
        { id: 't-lab', valor: 'LABORATORIO' },
      ]);

    const setoresMock = [
      { id: 's-1', plantaId: 'planta-1', tipoOpcaoId: 't-almox', ativo: true },
      { id: 's-2', plantaId: 'planta-1', tipoOpcaoId: 't-navalha', ativo: true },
      { id: 's-3', plantaId: 'planta-1', tipoOpcaoId: 't-corte-rec', ativo: true },
      { id: 's-4', plantaId: 'planta-1', tipoOpcaoId: 't-corte-sep', ativo: true },
      { id: 's-5', plantaId: 'planta-1', tipoOpcaoId: 't-corte-dub', ativo: true },
      { id: 's-6', plantaId: 'planta-1', tipoOpcaoId: 't-corte-ponte', ativo: true },
      { id: 's-7', plantaId: 'planta-1', tipoOpcaoId: 't-corte-lectra', ativo: true },
      { id: 's-8', plantaId: 'planta-1', tipoOpcaoId: 't-corte-laser', ativo: true },
      { id: 's-9', plantaId: 'planta-1', tipoOpcaoId: 't-apoio', ativo: true },
      { id: 's-10', plantaId: 'planta-1', tipoOpcaoId: 't-costura', ativo: true },
      { id: 's-11', plantaId: 'planta-1', tipoOpcaoId: 't-montagem', ativo: true },
      { id: 's-12', plantaId: 'planta-1', tipoOpcaoId: 't-lab', ativo: true },
    ];

    mockSetorRepo.find.mockResolvedValueOnce(setoresMock);

    const rota: RotaEtapaInput[] = setoresMock.map((s, idx) => ({ setorId: s.id, ordem: idx + 1 }));

    await expect(validateRouteIntegrity(mockManager, rota, pecas, 'planta-1'))
      .rejects
      .toThrow(new RouteIntegrityError('O sub-setor CORTE_LASER deve constar na rota somente quando tiver peças vinculadas.'));
  });
});
