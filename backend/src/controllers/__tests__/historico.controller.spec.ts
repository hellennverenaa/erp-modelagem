import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { perfilPossuiPermissao } from '../../services/rbac.service';
import {
  buscarMovimentacoes,
  buscarSetorHistorico,
} from '../../services/historico.service';
import { HistoricoController } from '../historico.controller';

vi.mock('../../services/rbac.service', () => ({
  perfilPossuiPermissao: vi.fn(),
}));

vi.mock('../../services/historico.service', () => ({
  buscarMovimentacoes: vi.fn(),
  buscarOpcoesHistorico: vi.fn(),
  buscarPlantaHistorico: vi.fn(),
  buscarSetorHistorico: vi.fn(),
}));

function criarResponseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('HistoricoController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nega filtro de uma planta diferente para perfil sem acesso global', async () => {
    vi.mocked(perfilPossuiPermissao).mockResolvedValue(false);
    const plantaPropria = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const outraPlanta = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const controller = new HistoricoController();
    const req = {
      user: { perfilId: 'perfil-operador', plantaId: plantaPropria },
      query: { plantaId: outraPlanta },
    } as unknown as Request;
    const res = criarResponseMock();

    await controller.getMovimentacoes(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'O usuário não tem acesso à planta informada.',
      code: 'PLANTA_FORA_DO_ESCOPO',
    });
    expect(buscarMovimentacoes).not.toHaveBeenCalled();
  });

  it('nega setor pertencente a outra planta mesmo sem filtro de planta explícito', async () => {
    vi.mocked(perfilPossuiPermissao).mockResolvedValue(false);
    const setorExterno = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const plantaPropria = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const outraPlanta = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(buscarSetorHistorico).mockResolvedValue({
      id: setorExterno,
      plantaId: outraPlanta,
    } as never);
    const controller = new HistoricoController();
    const req = {
      user: { perfilId: 'perfil-operador', plantaId: plantaPropria },
      query: { setorId: setorExterno },
    } as unknown as Request;
    const res = criarResponseMock();

    await controller.getMovimentacoes(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'O setor informado está fora do escopo autorizado.',
      code: 'SETOR_FORA_DO_ESCOPO',
    });
    expect(buscarMovimentacoes).not.toHaveBeenCalled();
  });

  it('permite consulta global quando o perfil tem ACESSAR_TODAS_PLANTAS', async () => {
    vi.mocked(perfilPossuiPermissao).mockResolvedValue(true);
    vi.mocked(buscarMovimentacoes).mockResolvedValue({
      itens: [], pagina: 1, limite: 25, total: 0, totalPaginas: 0,
    });
    const controller = new HistoricoController();
    const req = {
      user: { perfilId: 'perfil-admin', plantaId: null },
      query: {},
    } as unknown as Request;
    const res = criarResponseMock();

    await controller.getMovimentacoes(req, res);

    expect(buscarMovimentacoes).toHaveBeenCalledWith(
      { acessoTodasPlantas: true, plantaId: null },
      { pagina: 1, limite: 25 },
    );
    expect(res.json).toHaveBeenCalledWith({
      itens: [], pagina: 1, limite: 25, total: 0, totalPaginas: 0,
    });
  });
});
