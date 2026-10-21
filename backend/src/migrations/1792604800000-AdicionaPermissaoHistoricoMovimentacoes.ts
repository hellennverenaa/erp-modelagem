import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdicionaPermissaoHistoricoMovimentacoes1792604800000 implements MigrationInterface {
  name = 'AdicionaPermissaoHistoricoMovimentacoes1792604800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;
    const definicao = {
      routeName: 'historico-movimentacoes',
      routePath: '/dashboard/historico',
      label: 'Histórico de Movimentações',
      viewPermission: 'TELA_HISTORICO_MOVIMENTACOES',
    };

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `INSERT INTO ${table('rbac_catalogo')} (chave, tipo, definicao, ordem, ativo)
         SELECT $1, 'tela', $2::jsonb, COALESCE(MAX(ordem), 0) + 1, TRUE
         FROM ${table('rbac_catalogo')}
         WHERE TRUE
         ON CONFLICT (chave) DO UPDATE
         SET tipo = EXCLUDED.tipo, definicao = EXCLUDED.definicao, ativo = TRUE`,
        ['TELA_HISTORICO_MOVIMENTACOES', JSON.stringify(definicao)],
      );

      await queryRunner.query(
        `INSERT INTO ${table('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
         SELECT id, NULL, 'TELA_HISTORICO_MOVIMENTACOES', TRUE
         FROM ${table('perfis')}
         WHERE ativo = TRUE AND nome IN ('ADMIN', 'ADMIN_AUTOMACAO')
         ON CONFLICT (perfil_id, acao) WHERE setor_id IS NULL
         DO UPDATE SET permitido = TRUE, updated_at = now()`,
      );

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

    await queryRunner.query(
      `DELETE FROM ${table('perfil_permissoes')} WHERE acao = 'TELA_HISTORICO_MOVIMENTACOES'`,
    );
    await queryRunner.query(
      `DELETE FROM ${table('rbac_catalogo')} WHERE chave = 'TELA_HISTORICO_MOVIMENTACOES'`,
    );
  }
}
