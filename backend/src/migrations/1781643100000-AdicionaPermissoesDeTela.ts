import { MigrationInterface, QueryRunner } from 'typeorm';
import { RBAC_GLOBAL_ACTIONS, RBAC_SCREENS, RBAC_SECTOR_ACTIONS } from '../config/rbac.catalog';

export class AdicionaPermissoesDeTela1781643100000 implements MigrationInterface {
  name = 'AdicionaPermissoesDeTela1781643100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `INSERT INTO ${table('perfis')} (nome, descricao, permissoes, ativo)
         VALUES ('VISUALIZADOR', 'Acesso de leitura às telas liberadas para o perfil.', '{}'::jsonb, TRUE)
         ON CONFLICT (nome) DO NOTHING`,
      );

      await queryRunner.query(
        `WITH duplicadas AS (
           SELECT id, row_number() OVER (
             PARTITION BY perfil_id, setor_id, acao
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS posicao
           FROM ${table('perfil_permissoes')}
         )
         DELETE FROM ${table('perfil_permissoes')} AS permissao
         USING duplicadas
         WHERE permissao.id = duplicadas.id AND duplicadas.posicao > 1`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_perfil_permissoes_global_profile_acao"
         ON ${table('perfil_permissoes')} (perfil_id, acao) WHERE setor_id IS NULL`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_perfil_permissoes_setor_profile_setor_acao"
         ON ${table('perfil_permissoes')} (perfil_id, setor_id, acao) WHERE setor_id IS NOT NULL`,
      );

      const profiles = await queryRunner.query(
        `SELECT id, nome FROM ${table('perfis')} WHERE ativo = TRUE`,
      ) as Array<{ id: string; nome: string }>;

      const commonRouteNames = new Set([
        'modelos', 'catalogo-pecas', 'ordens', 'bipagem', 'inspecao', 'rastreamento-ordem', 'checklist',
      ]);
      const legacyProfileNames = new Set([
        'ADMIN', 'MODELISTA', 'GERENTE', 'SUPERVISOR_SETOR', 'OPERADOR',
        'GERENTE_MODELAGEM', 'ASSISTENTE_MODELAGEM', 'VISUALIZADOR',
      ]);
      const routeAndCreateNames = new Set(['ADMIN', 'MODELISTA', 'GERENTE']);
      const managerialNames = new Set(['ADMIN', 'GERENTE', 'SUPERVISOR_SETOR']);
      const editableScreensByProfile = new Map<string, Set<string>>([
        ['ADMIN', new Set(RBAC_SCREENS.map((screen) => screen.routeName))],
        ['MODELISTA', new Set(['modelos', 'catalogo-pecas', 'ordens', 'rotas', 'novo-teste'])],
        ['GERENTE', new Set(['ordens', 'rotas', 'novo-teste'])],
      ]);

      for (const profile of profiles) {
        const nome = profile.nome.trim().toUpperCase();
        if (nome === 'ADMIN_AUTOMACAO') {
          // A equipe de automação administra o RBAC pela allowlist e começa sem acesso às telas de operação.
          await queryRunner.query(
            `DELETE FROM ${table('perfil_permissoes')} WHERE perfil_id = $1`,
            [profile.id],
          );
          continue;
        }

        const permittedScreens = new Set<string>();
        const editableScreens = new Set(editableScreensByProfile.get(nome) || []);
        const existingSectorActions = await queryRunner.query(
          `SELECT DISTINCT acao FROM ${table('perfil_permissoes')}
           WHERE perfil_id = $1 AND setor_id IS NOT NULL AND permitido = TRUE`,
          [profile.id],
        ) as Array<{ acao: string }>;
        const sectorActions = new Set(existingSectorActions.map(({ acao }) => acao));
        const existingGlobalActions = await queryRunner.query(
          `SELECT DISTINCT acao FROM ${table('perfil_permissoes')}
           WHERE perfil_id = $1 AND setor_id IS NULL AND permitido = TRUE`,
          [profile.id],
        ) as Array<{ acao: string }>;
        const globalActionsForProfile = new Set(existingGlobalActions.map(({ acao }) => acao));

        if (sectorActions.has('BIPAR_ENTRADA') || sectorActions.has('BIPAR_SAIDA') ||
            sectorActions.has('REVISAO_MAQUINA') || sectorActions.has('FECHAMENTO_LOTE') ||
            globalActionsForProfile.has('ADMINISTRAR_BIPAGEM')) {
          editableScreens.add('bipagem');
        }
        if (sectorActions.has('PREENCHER_CHECKLIST')) editableScreens.add('checklist');
        if (sectorActions.has('INSPECIONAR_SETOR')) editableScreens.add('inspecao');

        const sectorDrivenScreens = new Set<string>();
        if (sectorActions.has('BIPAR_ENTRADA') || sectorActions.has('BIPAR_SAIDA') ||
            sectorActions.has('REVISAO_MAQUINA') || sectorActions.has('FECHAMENTO_LOTE')) {
          sectorDrivenScreens.add('bipagem');
        }
        if (sectorActions.has('PREENCHER_CHECKLIST')) sectorDrivenScreens.add('checklist');
        if (sectorActions.has('INSPECIONAR_SETOR')) sectorDrivenScreens.add('inspecao');
        if (globalActionsForProfile.has('ADMINISTRAR_BIPAGEM')) sectorDrivenScreens.add('bipagem');
        if (globalActionsForProfile.has('EDITAR_ROTA')) {
          editableScreens.add('rotas');
          sectorDrivenScreens.add('rotas');
        }

        for (const screen of RBAC_SCREENS) {
          if ((legacyProfileNames.has(nome) && commonRouteNames.has(screen.routeName)) || nome === 'ADMIN') {
            permittedScreens.add(screen.viewPermission);
          }
          if (routeAndCreateNames.has(nome) && ['rotas', 'novo-teste'].includes(screen.routeName)) {
            permittedScreens.add(screen.viewPermission);
          }
          if (managerialNames.has(nome) && screen.routeName === 'gerencial') {
            permittedScreens.add(screen.viewPermission);
          }

          if (sectorDrivenScreens.has(screen.routeName)) {
            permittedScreens.add(screen.viewPermission);
          }

          // Apenas permissões legadas conhecidas e ações de setor já concedidas são migradas.
          // Perfis personalizados ficam sem concessões para configuração explícita no frontend.
          if (screen.editPermission && editableScreens.has(screen.routeName) &&
              (permittedScreens.has(screen.viewPermission) || sectorDrivenScreens.has(screen.routeName))) {
            permittedScreens.add(screen.editPermission);
          }
        }

        for (const acao of permittedScreens) {
          await queryRunner.query(
            `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
             VALUES ($1, NULL, $2, TRUE)
             ON CONFLICT DO NOTHING`,
            [profile.id, acao],
          );
        }

        const globalActions = new Set<string>();
        if (nome === 'ADMIN') {
          for (const action of RBAC_GLOBAL_ACTIONS) globalActions.add(action.acao);
          for (const action of RBAC_SECTOR_ACTIONS) globalActions.add(action.acao);
        }
        if (['ADMIN', 'MODELISTA', 'GERENTE'].includes(nome)) globalActions.add('EDITAR_ROTA');
        for (const acao of globalActions) {
          await queryRunner.query(
            `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
             VALUES ($1, NULL, $2, TRUE)
             ON CONFLICT DO NOTHING`,
            [profile.id, acao],
          );
        }

        if (nome === 'ADMIN') {
          const setores = await queryRunner.query(
            `SELECT id FROM ${table('setores')} WHERE ativo = TRUE`,
          ) as Array<{ id: string }>;
          for (const setor of setores) {
            for (const action of RBAC_SECTOR_ACTIONS) {
              await queryRunner.query(
                `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
                 VALUES ($1, $2, $3, TRUE)
                 ON CONFLICT DO NOTHING`,
                [profile.id, setor.id, action.acao],
              );
            }
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    // Mantém perfis e concessões já editados pela equipe; remove apenas os índices técnicos.
    await queryRunner.query(`DROP INDEX IF EXISTS ${q(schema)}."UQ_perfil_permissoes_global_profile_acao"`);
    await queryRunner.query(`DROP INDEX IF EXISTS ${q(schema)}."UQ_perfil_permissoes_setor_profile_setor_acao"`);
  }
}
