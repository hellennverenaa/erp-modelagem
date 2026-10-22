import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDataSource } from '../../config/database';
import { buscarMovimentacoes } from '../historico.service';

vi.mock('../../config/database', () => ({
  AppDataSource: {
    query: vi.fn(),
    getRepository: vi.fn(),
  },
}));

describe('buscarMovimentacoes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aplica escopo, filtros e paginação ao consolidar os eventos', async () => {
    vi.mocked(AppDataSource.query)
      .mockResolvedValueOnce([{
        id: 'bipagem-entrada:registro-1',
        data_hora: '2026-10-20T12:00:00.000Z',
        categoria: 'BIPAGEM',
        acao: 'BIPAGEM_ENTRADA',
        descricao: 'Entrada registrada no setor',
        usuario_id: 'usuario-1',
        usuario_nome: 'Operador Teste',
        planta_id: 'planta-1',
        planta_nome: 'Planta A',
        setor_id: 'setor-1',
        setor_nome: 'Montagem',
        ordem_id: 'ordem-1',
        codigo_ordem: 'OP-123',
        entidade_tipo: 'rastreamentos',
        entidade_id: 'registro-1',
        dados_anteriores: null,
        dados_novos: null,
        detalhes: { tipoLote: 'LOTE_PRINCIPAL' },
        responsavel_nome: null,
        total_linhas: '1',
      }]);

    const resultado = await buscarMovimentacoes(
      { acessoTodasPlantas: false, plantaId: 'planta-1' },
      {
        pagina: 2,
        limite: 10,
        setorId: 'setor-1',
        dataInicio: '2026-10-01',
        categoria: 'BIPAGEM',
        busca: 'OP_123',
      },
    );

    expect(resultado).toMatchObject({ pagina: 2, limite: 10, total: 1, totalPaginas: 1 });
    expect(resultado.itens[0]).toMatchObject({
      id: 'bipagem-entrada:registro-1',
      rotuloAcao: 'Entrada bipada',
      ordem: { codigoBarras: 'OP-123' },
      setor: { nome: 'Montagem' },
      detalhes: { tipoLote: 'LOTE_PRINCIPAL' },
    });

    const chamadas = vi.mocked(AppDataSource.query).mock.calls;
    const consultaPaginada = String(chamadas[0][0]);
    expect(consultaPaginada).toContain('evento.planta_id = $1');
    expect(consultaPaginada).toContain("evento.entidade_tipo IN ('modelos', 'catalogo_pecas')");
    expect(consultaPaginada).toContain('evento.setor_id = $2');
    expect(consultaPaginada).toContain('rastreamento."tipoLote"');
    expect(consultaPaginada).toContain('inspecao."tipoInspecao"');
    expect(consultaPaginada).toContain('inspecao."tipoLote"');
    expect(consultaPaginada).toContain('COALESCE(estacao.descricao, estacao.codigo)');
    expect(consultaPaginada.match(/COALESCE\(estacao\.descricao, estacao\.codigo\)/g)).toHaveLength(3);
    expect(consultaPaginada.match(/lower\(etapa\.etapa::text\)/g)).toHaveLength(3);
    expect(consultaPaginada).toContain('ORDER BY evento.data_hora DESC, evento.id DESC');
    expect(consultaPaginada).toContain('LIMIT $6 OFFSET $7');
    expect(chamadas[0][1]).toEqual([
      'planta-1',
      'setor-1',
      '2026-10-01',
      'BIPAGEM',
      '%OP!_123%',
      10,
      10,
    ]);
  });

  it('não restringe a planta para um perfil com acesso global sem filtro de planta', async () => {
    vi.mocked(AppDataSource.query)
      .mockResolvedValueOnce([]);

    await buscarMovimentacoes(
      { acessoTodasPlantas: true, plantaId: null },
      { pagina: 1, limite: 25 },
    );

    const consultaPaginada = String(vi.mocked(AppDataSource.query).mock.calls[0][0]);
    expect(consultaPaginada).not.toContain('evento.planta_id = $1');
    expect(consultaPaginada).toContain('ORDER BY evento.data_hora DESC, evento.id DESC');
    expect(vi.mocked(AppDataSource.query).mock.calls[0][1]).toEqual([25, 0]);
  });
});
