import { MigrationInterface, QueryRunner } from 'typeorm';

export class ControlaConfiguracaoOrdemRbac1791981100000 implements MigrationInterface {
  name = 'ControlaConfiguracaoOrdemRbac1791981100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const qualified = (table: string) => `"${schema}"."${table}"`;
    const definition = {
      acao: 'CONFIGURAR_ORDEM_TESTE',
      label: 'Configurar SLAs e remanejamento de peças da ordem',
    };

    await queryRunner.query(
      `INSERT INTO ${qualified('rbac_catalogo')} (chave, tipo, definicao, ordem, ativo)
       VALUES ('CONFIGURAR_ORDEM_TESTE', 'acao_global', $1::jsonb,
         COALESCE((SELECT MAX(ordem) + 1 FROM ${qualified('rbac_catalogo')} WHERE tipo = 'acao_global'), 1), true)
       ON CONFLICT (chave) DO UPDATE SET tipo = EXCLUDED.tipo, definicao = EXCLUDED.definicao, ativo = true`,
      [JSON.stringify(definition)],
    );

    await queryRunner.query(
      `INSERT INTO ${qualified('perfil_permissoes')} (perfil_id, setor_id, acao, permitido)
       SELECT DISTINCT perfil_id, NULL::uuid, 'CONFIGURAR_ORDEM_TESTE', TRUE
       FROM ${qualified('perfil_permissoes')}
       WHERE acao = 'EDITAR_TELA_GESTAO_ORDENS' AND setor_id IS NULL AND permitido = TRUE
       ON CONFLICT (perfil_id, acao) WHERE setor_id IS NULL DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const qualified = (table: string) => `"${schema}"."${table}"`;

    await queryRunner.query(
      `DELETE FROM ${qualified('perfil_permissoes')} WHERE acao = 'CONFIGURAR_ORDEM_TESTE' AND setor_id IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM ${qualified('rbac_catalogo')} WHERE chave = 'CONFIGURAR_ORDEM_TESTE'`,
    );
  }
}
