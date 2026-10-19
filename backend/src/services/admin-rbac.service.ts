import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Perfil } from '../entities/Perfil';
import { Usuario } from '../entities/Usuario';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Setor } from '../entities/Setor';
import { AuditLog } from '../entities/AuditLog';
import { PERFIL_ADMIN_AUTOMACAO, ehUsuarioAdminAutomacao } from '../config/rbac.constants';
import { perfilPossuiPermissao } from './rbac.service';
import { carregarCatalogoRbac } from './rbac-catalog.service';

export class AdminRbacError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'RBAC_ERROR'
  ) {
    super(message);
    this.name = 'AdminRbacError';
  }
}

export interface ContextoAuditoria {
  usuarioId?: string | null;
  ipAddress?: string | null;
  isAutomationActor: boolean;
}

export interface ItemPermissaoInput {
  perfilId: string;
  setorId: string | null;
  acao: string;
  permitido: boolean;
}

export class AdminRbacService {
  /**
   * Lista todos os perfis cadastrados, ocultando ADMIN_AUTOMACAO para usuários não autorizados.
   */
  public static async listarPerfis(isAutomationActor: boolean): Promise<Perfil[]> {
    const perfilRepo = AppDataSource.getRepository(Perfil);
    const perfis = await perfilRepo.find({ order: { nome: 'ASC' } });
    return isAutomationActor
      ? perfis
      : perfis.filter((perfil) => perfil.nome !== PERFIL_ADMIN_AUTOMACAO);
  }

  /**
   * Cria um novo perfil de acesso e registra no log de auditoria.
   */
  public static async criarPerfil(
    dados: { nome: string; descricao?: string | null },
    contexto: ContextoAuditoria
  ): Promise<Perfil> {
    const perfilRepo = AppDataSource.getRepository(Perfil);
    const nome = dados.nome.replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');

    if (['ADMIN', 'ADMIN_AUTOMACAO'].includes(nome)) {
      throw new AdminRbacError('Esse nome é reservado a um perfil de sistema.', 409, 'PERFIL_SYSTEM_NAME_RESERVED');
    }

    const existente = await perfilRepo.findOne({ where: { nome } });
    if (existente) {
      throw new AdminRbacError('Já existe um perfil com esse nome.', 409, 'PERFIL_DUPLICATE_NAME');
    }

    const perfil = perfilRepo.create({
      nome,
      descricao: dados.descricao?.trim() || null,
      permissoes: {},
      ativo: true,
    });

    return await AppDataSource.transaction(async (manager) => {
      const criado = await manager.getRepository(Perfil).save(perfil);
      await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
        usuarioId: contexto.usuarioId || null,
        acao: 'RBAC_PERFIL_CRIADO',
        entidadeTipo: 'perfis',
        entidadeId: criado.id,
        dadosAnteriores: null,
        dadosNovos: { nome: criado.nome, descricao: criado.descricao, ativo: criado.ativo },
        ipAddress: contexto.ipAddress || null,
      }));
      return criado;
    });
  }

  /**
   * Atualiza dados de um perfil de acesso ou o inativa com proteções de segurança.
   */
  public static async atualizarPerfil(
    id: string,
    dados: { nome?: string; descricao?: string | null; ativo?: boolean },
    contexto: ContextoAuditoria
  ): Promise<Perfil> {
    const perfilRepo = AppDataSource.getRepository(Perfil);
    const perfil = await perfilRepo.findOne({ where: { id } });
    if (!perfil) {
      throw new AdminRbacError('Perfil não encontrado.', 404, 'PERFIL_NOT_FOUND');
    }

    if (!contexto.isAutomationActor && perfil.nome === PERFIL_ADMIN_AUTOMACAO) {
      throw new AdminRbacError(
        'O perfil ADMIN_AUTOMACAO só pode ser administrado pela equipe de automação.',
        403,
        'RBAC_AUTOMACAO_PROFILE_PROTECTED'
      );
    }

    if (!contexto.isAutomationActor && dados.ativo === false && await perfilPossuiPermissao(perfil.id, 'TELA_GESTAO_RBAC')) {
      throw new AdminRbacError(
        'Somente a equipe de automação pode revogar acesso à Matriz de Acessos.',
        403,
        'RBAC_MATRIX_ACCESS_AUTOMATION_ONLY'
      );
    }

    if (['ADMIN', 'VISUALIZADOR', PERFIL_ADMIN_AUTOMACAO].includes(perfil.nome) && (
      (dados.nome !== undefined && dados.nome.trim().toLocaleUpperCase('pt-BR') !== perfil.nome) ||
      dados.ativo === false
    )) {
      throw new AdminRbacError(
        `O perfil ${perfil.nome} é protegido e não pode ser renomeado ou desativado.`,
        409,
        'PERFIL_SYSTEM_PROTECTED'
      );
    }

    const anteriores = { nome: perfil.nome, descricao: perfil.descricao, ativo: perfil.ativo };

    if (dados.nome !== undefined) {
      const nome = dados.nome.replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
      if (['ADMIN', 'ADMIN_AUTOMACAO', 'VISUALIZADOR'].includes(nome) && nome !== perfil.nome) {
        throw new AdminRbacError('Esse nome é reservado a um perfil de sistema.', 409, 'PERFIL_SYSTEM_NAME_RESERVED');
      }
      const duplicado = await perfilRepo.findOne({ where: { nome } });
      if (duplicado && duplicado.id !== perfil.id) {
        throw new AdminRbacError('Já existe um perfil com esse nome.', 409, 'PERFIL_DUPLICATE_NAME');
      }
      perfil.nome = nome;
    }

    if (dados.descricao !== undefined) {
      perfil.descricao = dados.descricao?.trim() || null;
    }

    if (dados.ativo === false) {
      const usuariosAssociados = await AppDataSource.getRepository(Usuario).count({ where: { perfilId: perfil.id } });
      if (usuariosAssociados > 0) {
        throw new AdminRbacError('Reatribua os usuários deste perfil antes de desativá-lo.', 409, 'PERFIL_HAS_USERS');
      }
    }

    if (dados.ativo !== undefined) {
      perfil.ativo = dados.ativo;
    }

    return await AppDataSource.transaction(async (manager) => {
      const atualizado = await manager.getRepository(Perfil).save(perfil);
      const novos = { nome: atualizado.nome, descricao: atualizado.descricao, ativo: atualizado.ativo };
      if (JSON.stringify(anteriores) !== JSON.stringify(novos)) {
        await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
          usuarioId: contexto.usuarioId || null,
          acao: 'RBAC_PERFIL_ATUALIZADO',
          entidadeTipo: 'perfis',
          entidadeId: atualizado.id,
          dadosAnteriores: anteriores,
          dadosNovos: novos,
          ipAddress: contexto.ipAddress || null,
        }));
      }
      return atualizado;
    });
  }

  /**
   * Atualiza permissões de forma atômica calculando dependências (edição requer visualização) e gravando auditoria.
   */
  public static async atualizarPermissoes(
    itens: ItemPermissaoInput[],
    contexto: ContextoAuditoria
  ): Promise<PerfilPermissao[]> {
    const catalogo = await carregarCatalogoRbac();
    const byPermissionKey = new Map(itens.map((item) => [
      `${item.perfilId}|${item.setorId || ''}|${item.acao}`,
      item,
    ]));

    for (const screen of catalogo.screens) {
      if (!screen.editPermission) continue;
      for (const item of itens) {
        if (item.setorId !== null) continue;
        if (item.acao === screen.editPermission && item.permitido) {
          const viewKey = `${item.perfilId}||${screen.viewPermission}`;
          const explicitView = byPermissionKey.get(viewKey);
          if (explicitView?.permitido === false) {
            throw new AdminRbacError('A permissão de edição exige acesso de visualização à mesma tela.', 400, 'RBAC_EDIT_REQUIRES_VIEW');
          }
          if (!explicitView) {
            byPermissionKey.set(viewKey, {
              perfilId: item.perfilId,
              setorId: null,
              acao: screen.viewPermission,
              permitido: true,
            });
          }
        }

        if (item.acao === screen.viewPermission && !item.permitido) {
          const editKey = `${item.perfilId}||${screen.editPermission}`;
          const explicitEdit = byPermissionKey.get(editKey);
          if (explicitEdit?.permitido === true) {
            throw new AdminRbacError('Não é possível remover a visualização enquanto a edição estiver habilitada.', 400, 'RBAC_VIEW_REQUIRED_FOR_EDIT');
          }
          byPermissionKey.set(editKey, {
            perfilId: item.perfilId,
            setorId: null,
            acao: screen.editPermission,
            permitido: false,
          });
        }
      }
    }

    const itemsToSave = [...byPermissionKey.values()];
    const profileIds = [...new Set(itemsToSave.map(({ perfilId }) => perfilId))];

    return await AppDataSource.transaction(async (manager) => {
      const profiles = await manager.getRepository(Perfil).findBy({ id: In(profileIds), ativo: true });
      if (profiles.length !== profileIds.length) {
        throw new AdminRbacError('Um ou mais perfis não existem ou estão inativos.', 404, 'PERFIL_NOT_FOUND');
      }

      if (!contexto.isAutomationActor && profiles.some((profile) => profile.nome === PERFIL_ADMIN_AUTOMACAO)) {
        throw new AdminRbacError(
          'O perfil ADMIN_AUTOMACAO só pode ser administrado pela equipe de automação.',
          403,
          'RBAC_AUTOMACAO_PROFILE_PROTECTED'
        );
      }

      const sectorIds = [...new Set(itemsToSave.map(({ setorId }) => setorId).filter((id): id is string => !!id))];
      if (sectorIds.length > 0) {
        const sectors = await manager.getRepository(Setor).findBy({ id: In(sectorIds), ativo: true });
        if (sectors.length !== sectorIds.length) {
          throw new AdminRbacError('Um ou mais setores não existem ou estão inativos.', 404, 'SETOR_NOT_FOUND');
        }
      }

      const permissionRepo = manager.getRepository(PerfilPermissao);
      const auditRepo = manager.getRepository(AuditLog);
      const saved: PerfilPermissao[] = [];

      for (const item of itemsToSave) {
        let permission = await permissionRepo.findOne({
          where: {
            perfilId: item.perfilId,
            setorId: item.setorId === null ? IsNull() : item.setorId,
            acao: item.acao,
          },
        });
        const antes = permission ? { permitido: permission.permitido } : null;
        if (permission) {
          permission.permitido = item.permitido;
        } else {
          permission = permissionRepo.create(item);
        }
        if (antes?.permitido !== item.permitido) {
          const salvo = await permissionRepo.save(permission);
          await auditRepo.save(auditRepo.create({
            usuarioId: contexto.usuarioId || null,
            acao: 'RBAC_PERMISSAO_ALTERADA',
            entidadeTipo: 'perfil_permissoes',
            entidadeId: salvo.id,
            dadosAnteriores: antes,
            dadosNovos: {
              perfilId: salvo.perfilId,
              setorId: salvo.setorId,
              acao: salvo.acao,
              permitido: salvo.permitido,
            },
            ipAddress: contexto.ipAddress || null,
          }));
          saved.push(salvo);
        } else {
          saved.push(permission);
        }
      }
      return saved;
    });
  }

  /**
   * Altera o perfil e setor de um usuário com validação de privilégios.
   */
  public static async atualizarPerfilUsuario(
    usuarioId: string,
    novoPerfilId: string,
    setorId: string | null | undefined,
    contexto: ContextoAuditoria
  ): Promise<Usuario> {
    const userRepo = AppDataSource.getRepository(Usuario);
    const perfilRepo = AppDataSource.getRepository(Perfil);

    const user = await userRepo.findOne({
      where: { id: usuarioId },
      relations: { perfil: true, setor: true },
    });

    if (!user) {
      throw new AdminRbacError('Usuário não encontrado.', 404, 'USUARIO_NOT_FOUND');
    }

    if (!contexto.isAutomationActor && (
      user.perfil?.nome === PERFIL_ADMIN_AUTOMACAO || ehUsuarioAdminAutomacao(user.usuario)
    )) {
      throw new AdminRbacError(
        'Contas e perfil ADMIN_AUTOMACAO só podem ser alterados pela equipe de automação.',
        403,
        'RBAC_AUTOMACAO_PROFILE_PROTECTED'
      );
    }

    const novoPerfil = await perfilRepo.findOne({ where: { id: novoPerfilId, ativo: true } });
    if (!novoPerfil) {
      throw new AdminRbacError('Perfil não encontrado ou inativo.', 404, 'PERFIL_NOT_FOUND');
    }

    if (!contexto.isAutomationActor && novoPerfil.id !== user.perfilId) {
      const [origemTemAcessoRbac, destinoTemAcessoRbac] = await Promise.all([
        perfilPossuiPermissao(user.perfilId, 'TELA_GESTAO_RBAC'),
        perfilPossuiPermissao(novoPerfil.id, 'TELA_GESTAO_RBAC'),
      ]);
      if (origemTemAcessoRbac || destinoTemAcessoRbac) {
        throw new AdminRbacError(
          'Somente a equipe de automação pode conceder ou revogar acesso à Matriz de Acessos.',
          403,
          'RBAC_MATRIX_ACCESS_AUTOMATION_ONLY'
        );
      }
    }

    const usuarioAdminAutomacao = ehUsuarioAdminAutomacao(user.usuario);
    if (
      (novoPerfil.nome === PERFIL_ADMIN_AUTOMACAO && !usuarioAdminAutomacao) ||
      (usuarioAdminAutomacao && novoPerfil.nome !== PERFIL_ADMIN_AUTOMACAO)
    ) {
      throw new AdminRbacError(
        'O perfil ADMIN_AUTOMACAO só pode ser provisionado para as contas autorizadas.',
        403,
        'RBAC_AUTOMACAO_ASSIGNMENT_RESTRICTED'
      );
    }

    const anteriores = { perfilId: user.perfilId, setorId: user.setorId };
    user.perfil = novoPerfil;
    user.perfilId = novoPerfil.id;

    if (setorId !== undefined) {
      if (setorId === null || setorId === '') {
        user.setor = null;
        user.setorId = null;
      } else {
        const setorRepo = AppDataSource.getRepository(Setor);
        const setor = await setorRepo.findOne({ where: { id: setorId, ativo: true } });
        if (!setor) {
          throw new AdminRbacError('Setor não encontrado ou inativo.', 404, 'SETOR_NOT_FOUND');
        }
        user.setor = setor;
        user.setorId = setor.id;
      }
    }

    return await AppDataSource.transaction(async (manager) => {
      const atualizado = await manager.getRepository(Usuario).save(user);
      const novos = { perfilId: atualizado.perfilId, setorId: atualizado.setorId };
      if (JSON.stringify(anteriores) !== JSON.stringify(novos)) {
        await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
          usuarioId: contexto.usuarioId || null,
          acao: 'RBAC_USUARIO_ATUALIZADO',
          entidadeTipo: 'usuarios',
          entidadeId: atualizado.id,
          dadosAnteriores: anteriores,
          dadosNovos: novos,
          ipAddress: contexto.ipAddress || null,
        }));
      }
      return atualizado;
    });
  }

  /**
   * Concede ou revoga permissão individual de pausar o SLA de fábrica.
   */
  public static async atualizarPermissaoPausaSla(
    usuarioId: string,
    permitido: boolean,
    contexto: ContextoAuditoria
  ): Promise<{ id: string; podeInterromperSla: boolean }> {
    if (!contexto.isAutomationActor) {
      throw new AdminRbacError(
        'Somente ADMIN_AUTOMACAO pode definir quem pode interromper o SLA.',
        403,
        'RBAC_AUTOMACAO_REQUIRED'
      );
    }

    const userRepo = AppDataSource.getRepository(Usuario);
    const user = await userRepo.findOne({ where: { id: usuarioId }, relations: { perfil: true } });
    if (!user) {
      throw new AdminRbacError('Usuário não encontrado.', 404, 'USUARIO_NOT_FOUND');
    }

    if (user.perfil?.nome === PERFIL_ADMIN_AUTOMACAO && ehUsuarioAdminAutomacao(user.usuario)) {
      throw new AdminRbacError(
        'Contas ADMIN_AUTOMACAO mantêm acesso permanente à interrupção do SLA.',
        409,
        'RBAC_AUTOMACAO_PERMISSION_PROTECTED'
      );
    }

    const anterior = user.podeInterromperSla;
    return await AppDataSource.transaction(async (manager) => {
      user.podeInterromperSla = permitido;
      const atualizado = await manager.getRepository(Usuario).save(user);
      if (anterior !== permitido) {
        await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
          usuarioId: contexto.usuarioId || null,
          acao: 'RBAC_USUARIO_PAUSA_SLA_ALTERADA',
          entidadeTipo: 'usuarios',
          entidadeId: atualizado.id,
          dadosAnteriores: { podeInterromperSla: anterior },
          dadosNovos: { podeInterromperSla: permitido },
          ipAddress: contexto.ipAddress || null,
        }));
      }
      return { id: atualizado.id, podeInterromperSla: atualizado.podeInterromperSla };
    });
  }
}
