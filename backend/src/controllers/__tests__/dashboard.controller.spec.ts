import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AppDataSource } from '../../config/database';
import { perfilPossuiPermissao } from '../../services/rbac.service';
import { DashboardController } from '../dashboard.controller';

vi.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: vi.fn(),
  },
}));

vi.mock('../../services/rbac.service', () => ({
  perfilPossuiPermissao: vi.fn(),
}));

describe('DashboardController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia pedido de outra planta sem ACESSAR_TODAS_PLANTAS', async () => {
    vi.mocked(perfilPossuiPermissao).mockResolvedValue(false);
    const controller = new DashboardController();
    const req = {
      user: {
        perfilId: 'perfil-operador',
        plantaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      query: { plantaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.getKpis(req, res);

    expect(perfilPossuiPermissao).toHaveBeenCalledWith('perfil-operador', 'ACESSAR_TODAS_PLANTAS');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'O usuário não tem acesso à planta informada.',
      code: 'PLANTA_FORA_DO_ESCOPO',
    });
    expect(AppDataSource.getRepository).not.toHaveBeenCalled();
  });
});
