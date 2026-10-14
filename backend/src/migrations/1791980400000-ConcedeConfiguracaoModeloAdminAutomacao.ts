import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConcedeConfiguracaoModeloAdminAutomacao1791980400000 implements MigrationInterface {
  name = 'ConcedeConfiguracaoModeloAdminAutomacao1791980400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${quote(schema)}.${quote(name)}`;

    const profiles = await queryRunner.query(
      `SELECT id FROM ${table('perfis')} WHERE nome = 'ADMIN_AUTOMACAO' AND ativo = TRUE`,
    ) as Array<{ id: string }>;
    if (profiles.length !== 1) {
      throw new Error('O perfil ativo ADMIN_AUTOMACAO deve existir exatamente uma vez.');
    }

    await queryRunner.query(
      `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
       VALUES ($1, NULL, 'CONFIGURAR_MODELO_ORDEM', TRUE)
       ON CONFLICT (perfil_id, acao) WHERE setor_id IS NULL DO NOTHING`,
      [profiles[0].id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${quote(schema)}.${quote(name)}`;

    await queryRunner.query(
      `DELETE FROM ${table('perfil_permissoes')}
       WHERE acao = 'CONFIGURAR_MODELO_ORDEM'
         AND setor_id IS NULL
         AND perfil_id = (SELECT id FROM ${table('perfis')} WHERE nome = 'ADMIN_AUTOMACAO')`,
    );
  }
}
