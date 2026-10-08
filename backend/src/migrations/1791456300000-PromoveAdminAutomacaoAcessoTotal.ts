import { MigrationInterface, QueryRunner } from 'typeorm';
import { RBAC_GLOBAL_ACTIONS, RBAC_SCREENS, RBAC_SECTOR_ACTIONS } from '../config/rbac.catalog';

export class PromoveAdminAutomacaoAcessoTotal1791456300000 implements MigrationInterface {
  name = 'PromoveAdminAutomacaoAcessoTotal1791456300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;

    await queryRunner.startTransaction();
    try {
      const profiles = await queryRunner.query(
        `SELECT id FROM ${table('perfis')} WHERE nome = 'ADMIN_AUTOMACAO' AND ativo = TRUE`,
      ) as Array<{ id: string }>;
      if (profiles.length !== 1) {
        throw new Error('O perfil ativo ADMIN_AUTOMACAO deve existir exatamente uma vez.');
      }

      const profileId = profiles[0].id;
      const globalPermissions = new Set([
        ...RBAC_SCREENS.flatMap(({ viewPermission, editPermission }) =>
          [viewPermission, editPermission].filter(Boolean) as string[]),
        ...RBAC_GLOBAL_ACTIONS.map(({ acao }) => acao),
      ]);

      for (const acao of globalPermissions) {
        await queryRunner.query(
          `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
           VALUES ($1, NULL, $2, TRUE)
           ON CONFLICT (perfil_id, acao) WHERE setor_id IS NULL
           DO UPDATE SET permitido = TRUE, updated_at = now()`,
          [profileId, acao],
        );
      }

      const sectors = await queryRunner.query(
        `SELECT id FROM ${table('setores')} WHERE ativo = TRUE`,
      ) as Array<{ id: string }>;

      for (const sector of sectors) {
        for (const { acao } of RBAC_SECTOR_ACTIONS) {
          await queryRunner.query(
            `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (perfil_id, setor_id, acao) WHERE setor_id IS NOT NULL
             DO UPDATE SET permitido = TRUE, updated_at = now()`,
            [profileId, sector.id, acao],
          );
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
    const table = (name: string) => `${q(schema)}.${q(name)}`;
    const globalPermissions = [
      ...new Set([
        ...RBAC_SCREENS.flatMap(({ viewPermission, editPermission }) =>
          [viewPermission, editPermission].filter(Boolean) as string[]),
        ...RBAC_GLOBAL_ACTIONS.map(({ acao }) => acao),
      ]),
    ];
    const sectorPermissions = RBAC_SECTOR_ACTIONS.map(({ acao }) => acao);

    await queryRunner.query(
      `DELETE FROM ${table('perfil_permissoes')}
       WHERE perfil_id = (SELECT id FROM ${table('perfis')} WHERE nome = 'ADMIN_AUTOMACAO')
         AND ((setor_id IS NULL AND acao = ANY($1::varchar[]))
           OR (setor_id IS NOT NULL AND acao = ANY($2::varchar[])))`,
      [globalPermissions, sectorPermissions],
    );
  }
}
