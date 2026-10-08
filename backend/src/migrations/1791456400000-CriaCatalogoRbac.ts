import { MigrationInterface, QueryRunner } from 'typeorm';
import { RBAC_GLOBAL_ACTIONS, RBAC_SCREENS, RBAC_SECTOR_ACTIONS } from '../config/rbac.catalog';

export class CriaCatalogoRbac1791456400000 implements MigrationInterface {
  name = 'CriaCatalogoRbac1791456400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem');
    const table = `"${schema.replace(/"/g, '""')}"."rbac_catalogo"`;
    await queryRunner.query(`CREATE TABLE ${table} (chave varchar(100) PRIMARY KEY, tipo varchar(20) NOT NULL, definicao jsonb NOT NULL, ordem integer NOT NULL, ativo boolean NOT NULL DEFAULT true, CONSTRAINT "CK_rbac_catalogo_tipo" CHECK (tipo IN ('tela', 'acao_global', 'acao_setor')))`);
    const rows = [
      ...RBAC_SCREENS.map((definicao, ordem) => ({ chave: definicao.viewPermission, tipo: 'tela', definicao, ordem })),
      ...RBAC_GLOBAL_ACTIONS.map((definicao, ordem) => ({ chave: definicao.acao, tipo: 'acao_global', definicao, ordem })),
      ...RBAC_SECTOR_ACTIONS.map((definicao, ordem) => ({ chave: definicao.acao, tipo: 'acao_setor', definicao, ordem })),
    ];
    for (const row of rows) {
      await queryRunner.query(`INSERT INTO ${table} (chave, tipo, definicao, ordem) VALUES ($1, $2, $3::jsonb, $4)`, [row.chave, row.tipo, JSON.stringify(row.definicao), row.ordem]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem');
    await queryRunner.query(`DROP TABLE "${schema.replace(/"/g, '""')}"."rbac_catalogo"`);
  }
}
