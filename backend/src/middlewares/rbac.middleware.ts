import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { ehUsuarioAdminAutomacao, PERFIL_ADMIN_AUTOMACAO } from '../config/rbac.constants';
import { perfilPossuiAlgumaPermissao, perfilPossuiPermissao } from '../services/rbac.service';

// ═══════════════════════════════════════════════════════════════════════════
// Middleware de RBAC Dinâmico — Zero Hardcode
// ═══════════════════════════════════════════════════════════════════════════
// Consulta a tabela `perfil_permissoes` em tempo de execução.
// NUNCA usa Enums estáticos de roles (ex: if role === 'admin').
// Conforme Seção 3.1 do implementation_plan_4.md

/**
 * Cria um middleware que verifica se o perfil do usuário autenticado
 * possui a ação permitida para o setor informado no body ou params.
 *
 * @param acao - A ação a verificar (ex: 'BIPAR_ENTRADA', 'BIPAR_SAIDA')
 * @param setorSource - De onde extrair o setorId: 'body' | 'params' | 'query'
 */
export function verificarPermissaoSetor(
  acao: string,
  setorSource: 'body' | 'params' | 'query' = 'body'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: 'Usuário não autenticado.',
        code: 'RBAC_UNAUTHENTICATED',
      });
      return;
    }

    // Extrai o setorId da fonte correta
    const setorId: string | undefined =
      setorSource === 'body' ? req.body?.setorId :
      setorSource === 'params' ? req.params?.setorId :
      req.query?.setorId as string | undefined;

    try {
      const perfilPermissaoRepo = AppDataSource.getRepository(PerfilPermissao);

      if (await perfilPossuiPermissao(user.perfilId, 'ADMINISTRAR_BIPAGEM')) {
        next();
        return;
      }

      // Busca a permissão de forma dinâmica:
      // Verifica se o perfil do usuário tem a ação permitida para:
      // 1) O setor específico da requisição (setorId)  OU
      // 2) Uma permissão global (setorId IS NULL) — ex: ADMINISTRAR_RBAC
      const permissao = await perfilPermissaoRepo
        .createQueryBuilder('pp')
        .where('pp.perfilId = :perfilId', { perfilId: user.perfilId })
        .andWhere('pp.acao = :acao', { acao })
        .andWhere('pp.permitido = true')
        .andWhere(
          '(pp.setorId = :setorId OR pp.setorId IS NULL)',
          { setorId: setorId || null }
        )
        .getOne();

      if (!permissao) {
        res.status(403).json({
          error: `Permissão negada. A ação '${acao}' não está autorizada para este perfil neste setor.`,
          code: 'RBAC_FORBIDDEN',
          details: {
            perfilId: user.perfilId,
            acao,
            setorId: setorId || 'global',
          },
        });
        return;
      }

      // Permissão concedida — prossegue para o controller
      next();
    } catch (err) {
      console.error('[RBAC] Erro ao consultar permissões:', err);
      res.status(500).json({
        error: 'Erro interno ao verificar permissões.',
        code: 'RBAC_INTERNAL_ERROR',
      });
    }
  };
}

export function exigirAdminAutomacao(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Usuário não autenticado.', code: 'RBAC_UNAUTHENTICATED' });
    return;
  }

  if (
    req.user.perfilNome?.trim().toUpperCase() !== PERFIL_ADMIN_AUTOMACAO ||
    !ehUsuarioAdminAutomacao(req.user.usuario)
  ) {
    res.status(403).json({
      error: 'Acesso restrito à equipe autorizada de automação.',
      code: 'RBAC_AUTOMACAO_REQUIRED',
    });
    return;
  }

  next();
}

/** Confere uma permissão global configurada para o perfil no banco. */
export function exigirPermissao(acao: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.', code: 'RBAC_UNAUTHENTICATED' });
      return;
    }

    try {
      const permitido = await perfilPossuiPermissao(req.user.perfilId, acao) ||
        (acao === 'EDITAR_TELA_BIPAGEM' && await perfilPossuiPermissao(req.user.perfilId, 'ADMINISTRAR_BIPAGEM'));
      if (!permitido) {
        res.status(403).json({
          error: `Acesso negado à permissão '${acao}'.`,
          code: 'RBAC_PERMISSION_DENIED',
          details: { perfilId: req.user.perfilId, acao },
        });
        return;
      }
      next();
    } catch (error) {
      console.error('[RBAC] Erro ao consultar permissão global:', error);
      res.status(500).json({ error: 'Erro interno ao verificar permissões.', code: 'RBAC_INTERNAL_ERROR' });
    }
  };
}

/** Confere se o perfil possui ao menos uma das permissões globais informadas. */
export function exigirAlgumaPermissao(acoes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.', code: 'RBAC_UNAUTHENTICATED' });
      return;
    }

    try {
      const permitido = await perfilPossuiAlgumaPermissao(req.user.perfilId, acoes) ||
        (acoes.includes('EDITAR_TELA_BIPAGEM') && await perfilPossuiPermissao(req.user.perfilId, 'ADMINISTRAR_BIPAGEM'));
      if (!permitido) {
        res.status(403).json({
          error: 'Seu perfil não possui acesso a este recurso.',
          code: 'RBAC_PERMISSION_DENIED',
          details: { perfilId: req.user.perfilId, acoes },
        });
        return;
      }
      next();
    } catch (error) {
      console.error('[RBAC] Erro ao consultar permissões globais:', error);
      res.status(500).json({ error: 'Erro interno ao verificar permissões.', code: 'RBAC_INTERNAL_ERROR' });
    }
  };
}

/** Permite carregar metadados comuns de tela e também a tela restrita de RBAC. */
export function exigirAlgumaPermissaoOuAdminAutomacao(acoes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.', code: 'RBAC_UNAUTHENTICATED' });
      return;
    }

    if (
      req.user.perfilNome?.trim().toUpperCase() === PERFIL_ADMIN_AUTOMACAO &&
      ehUsuarioAdminAutomacao(req.user.usuario)
    ) {
      next();
      return;
    }

    try {
      const permitido = await perfilPossuiAlgumaPermissao(req.user.perfilId, acoes) ||
        (acoes.includes('EDITAR_TELA_BIPAGEM') && await perfilPossuiPermissao(req.user.perfilId, 'ADMINISTRAR_BIPAGEM'));
      if (!permitido) {
        res.status(403).json({
          error: 'Seu perfil não possui acesso a este recurso.',
          code: 'RBAC_PERMISSION_DENIED',
          details: { perfilId: req.user.perfilId, acoes },
        });
        return;
      }
      next();
    } catch (error) {
      console.error('[RBAC] Erro ao consultar permissões globais:', error);
      res.status(500).json({ error: 'Erro interno ao verificar permissões.', code: 'RBAC_INTERNAL_ERROR' });
    }
  };
}
