import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';

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
