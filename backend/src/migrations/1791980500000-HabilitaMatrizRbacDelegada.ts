import { MigrationInterface, QueryRunner } from 'typeorm';

export class HabilitaMatrizRbacDelegada1791980500000 implements MigrationInterface {
  name = 'HabilitaMatrizRbacDelegada1791980500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${quote(schema)}.${quote(name)}`;

    const definition = {
      routeName: 'rbac',
      routePath: '/dashboard/rbac',
      label: 'Gestão de Perfis & Permissões',
      viewPermission: 'TELA_GESTAO_RBAC',
    };
    await queryRunner.query(
      `INSERT INTO ${table('rbac_catalogo')} (chave, tipo, definicao, ordem, ativo)
       VALUES ('TELA_GESTAO_RBAC', 'tela', $1::jsonb,
         COALESCE((SELECT MAX(ordem) + 1 FROM ${table('rbac_catalogo')} WHERE tipo = 'tela'), 1), true)
       ON CONFLICT (chave) DO UPDATE SET tipo = EXCLUDED.tipo, definicao = EXCLUDED.definicao, ativo = true`,
      [JSON.stringify(definition)],
    );

    const profiles = await queryRunner.query(
      `SELECT id FROM ${table('perfis')} WHERE nome = 'ADMIN_AUTOMACAO' AND ativo = TRUE`,
    ) as Array<{ id: string }>;
    if (profiles.length !== 1) {
      throw new Error('O perfil ativo ADMIN_AUTOMACAO deve existir exatamente uma vez.');
    }

    await queryRunner.query(
      `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
       VALUES ($1, NULL, 'TELA_GESTAO_RBAC', TRUE)
       ON CONFLICT (perfil_id, acao) WHERE setor_id IS NULL
       DO UPDATE SET permitido = EXCLUDED.permitido`,
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
      `DELETE FROM ${table('perfil_permissoes')} WHERE acao = 'TELA_GESTAO_RBAC'`,
    );
    await queryRunner.query(
      `DELETE FROM ${table('rbac_catalogo')} WHERE chave = 'TELA_GESTAO_RBAC'`,
    );
  }
}
