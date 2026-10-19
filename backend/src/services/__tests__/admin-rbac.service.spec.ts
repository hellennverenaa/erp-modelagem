import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminRbacService, AdminRbacError } from '../admin-rbac.service';
import { AppDataSource } from '../../config/database';
import { Perfil } from '../../entities/Perfil';
import { Usuario } from '../../entities/Usuario';
import { PERFIL_ADMIN_AUTOMACAO } from '../../config/rbac.constants';

vi.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../rbac.service', () => ({
  perfilPossuiPermissao: vi.fn(),
}));

vi.mock('../rbac-catalog.service', () => ({
  carregarCatalogoRbac: vi.fn().mockResolvedValue({
    screens: [
      { viewPermission: 'VER_MODELOS', editPermission: 'EDITAR_MODELOS' },
    ],
    globalActions: [{ acao: 'CRIAR_ORDEM' }],
    sectorActions: [{ acao: 'BIPAR_CORTE' }],
  }),
}));

describe('AdminRbacService - Regras de Segurança e Governança RBAC', () => {
  let mockPerfilRepo: any;
  let mockUsuarioRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPerfilRepo = {
      find: vi.fn(),
      findBy: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn((data: any) => ({ ...data, id: 'perfil-mock-id' })),
      save: vi.fn((data: any) => Promise.resolve(data)),
    };

    mockUsuarioRepo = {
      findOne: vi.fn(),
      count: vi.fn(),
      save: vi.fn((data: any) => Promise.resolve(data)),
    };

    (AppDataSource.getRepository as any).mockImplementation((entity: any) => {
      if (entity === Perfil) return mockPerfilRepo;
      if (entity === Usuario) return mockUsuarioRepo;
      throw new Error(`Repositório não mockado: ${entity.name}`);
    });
  });

  describe('listarPerfis', () => {
    it('deve ocultar o perfil ADMIN_AUTOMACAO se o solicitante não for ator de automação', async () => {
      const perfis = [
        { id: '1', nome: 'ADMIN' },
        { id: '2', nome: PERFIL_ADMIN_AUTOMACAO },
        { id: '3', nome: 'OPERADOR' },
      ];
      mockPerfilRepo.find.mockResolvedValueOnce(perfis);

      const resultado = await AdminRbacService.listarPerfis(false);
      expect(resultado).toHaveLength(2);
      expect(resultado.map((p) => p.nome)).not.toContain(PERFIL_ADMIN_AUTOMACAO);
    });

    it('deve exibir todos os perfis incluindo ADMIN_AUTOMACAO para ator de automação', async () => {
      const perfis = [
        { id: '1', nome: 'ADMIN' },
        { id: '2', nome: PERFIL_ADMIN_AUTOMACAO },
      ];
      mockPerfilRepo.find.mockResolvedValueOnce(perfis);

      const resultado = await AdminRbacService.listarPerfis(true);
      expect(resultado).toHaveLength(2);
      expect(resultado.map((p) => p.nome)).toContain(PERFIL_ADMIN_AUTOMACAO);
    });
  });

  describe('criarPerfil', () => {
    it('deve impedir criação de perfil com nomes reservados do sistema (ADMIN ou ADMIN_AUTOMACAO)', async () => {
      await expect(
        AdminRbacService.criarPerfil({ nome: 'admin' }, { isAutomationActor: false })
      ).rejects.toThrow(new AdminRbacError('Esse nome é reservado a um perfil de sistema.', 409, 'PERFIL_SYSTEM_NAME_RESERVED'));
    });

    it('deve impedir criação de perfil duplicado', async () => {
      mockPerfilRepo.findOne.mockResolvedValueOnce({ id: 'existente-id', nome: 'MODELISTA' });

      await expect(
        AdminRbacService.criarPerfil({ nome: 'Modelista' }, { isAutomationActor: false })
      ).rejects.toThrow(new AdminRbacError('Já existe um perfil com esse nome.', 409, 'PERFIL_DUPLICATE_NAME'));
    });
  });

  describe('atualizarPerfil', () => {
    it('deve bloquear renomeação ou inativação de perfis protegidos do sistema (ADMIN, VISUALIZADOR)', async () => {
      mockPerfilRepo.findOne.mockResolvedValueOnce({ id: 'p-1', nome: 'ADMIN', ativo: true });

      await expect(
        AdminRbacService.atualizarPerfil('p-1', { ativo: false }, { isAutomationActor: true })
      ).rejects.toThrow(new AdminRbacError('O perfil ADMIN é protegido e não pode ser renomeado ou desativado.', 409, 'PERFIL_SYSTEM_PROTECTED'));
    });

    it('deve impedir desativação de perfil se ainda houver usuários vinculados', async () => {
      mockPerfilRepo.findOne.mockResolvedValueOnce({ id: 'p-operador', nome: 'OPERADOR', ativo: true });
      mockUsuarioRepo.count.mockResolvedValueOnce(3);

      await expect(
        AdminRbacService.atualizarPerfil('p-operador', { ativo: false }, { isAutomationActor: false })
      ).rejects.toThrow(new AdminRbacError('Reatribua os usuários deste perfil antes de desativá-lo.', 409, 'PERFIL_HAS_USERS'));
    });
  });

  describe('atualizarPermissaoPausaSla', () => {
    it('deve rejeitar solicitação se o ator não for ADMIN_AUTOMACAO (403)', async () => {
      await expect(
        AdminRbacService.atualizarPermissaoPausaSla('user-1', true, { isAutomationActor: false })
      ).rejects.toThrow(new AdminRbacError('Somente ADMIN_AUTOMACAO pode definir quem pode interromper o SLA.', 403, 'RBAC_AUTOMACAO_REQUIRED'));
    });

    it('deve impedir alteração de permissão de SLA na conta ADMIN_AUTOMACAO (permanente)', async () => {
      mockUsuarioRepo.findOne.mockResolvedValueOnce({
        id: 'user-auto',
        usuario: 'hellen.magalhaes',
        perfil: { nome: PERFIL_ADMIN_AUTOMACAO },
      });

      await expect(
        AdminRbacService.atualizarPermissaoPausaSla('user-auto', false, { isAutomationActor: true })
      ).rejects.toThrow(new AdminRbacError('Contas ADMIN_AUTOMACAO mantêm acesso permanente à interrupção do SLA.', 409, 'RBAC_AUTOMACAO_PERMISSION_PROTECTED'));
    });
  });
});
