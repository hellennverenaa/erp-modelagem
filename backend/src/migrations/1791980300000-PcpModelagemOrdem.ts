import { MigrationInterface, QueryRunner } from 'typeorm';

export class PcpModelagemOrdem1791980300000 implements MigrationInterface {
  name = 'PcpModelagemOrdem1791980300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const qualified = (table: string) => `"${schema}"."${table}"`;
    const duplicateCodes = await queryRunner.query(
      `SELECT codigo_produto, COUNT(*)::int AS total FROM ${qualified('modelos')} GROUP BY codigo_produto HAVING COUNT(*) > 1`,
    );
    if (duplicateCodes.length > 0) {
      throw new Error(`Não foi possível garantir código de modelo único. Resolva manualmente as duplicidades existentes: ${duplicateCodes.map((row: any) => row.codigo_produto).join(', ')}.`);
    }
    const duplicateOrders = await queryRunner.query(
      `SELECT modelo_id, COUNT(*)::int AS total FROM ${qualified('ordens_teste')} GROUP BY modelo_id HAVING COUNT(*) > 1`,
    );
    if (duplicateOrders.length > 0) {
      throw new Error(`Não foi possível garantir a regra Modelo → Ordem 1:1. Resolva manualmente os modelos duplicados: ${duplicateOrders.map((row: any) => row.modelo_id).join(', ')}.`);
    }

    await queryRunner.query(`ALTER TYPE ${qualified('ordens_teste_status_enum')} ADD VALUE IF NOT EXISTS 'AGUARDANDO_MODELAGEM'`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} ALTER COLUMN possui_caixa_teste DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} ADD COLUMN rota_snapshot jsonb`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} ADD COLUMN rota_versao integer`);
    await queryRunner.query(`ALTER TABLE ${qualified('rota_modelo')} ADD COLUMN versao integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_modelos_codigo_produto" ON ${qualified('modelos')} (codigo_produto)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ordens_teste_modelo_id" ON ${qualified('ordens_teste')} (modelo_id)`);

    const definicao = { acao: 'CONFIGURAR_MODELO_ORDEM', label: 'Configurar peças, caixa teste e rota do modelo' };
    await queryRunner.query(
      `INSERT INTO ${qualified('rbac_catalogo')} (chave, tipo, definicao, ordem, ativo)
       VALUES ('CONFIGURAR_MODELO_ORDEM', 'acao_global', $1::jsonb,
         COALESCE((SELECT MAX(ordem) + 1 FROM ${qualified('rbac_catalogo')} WHERE tipo = 'acao_global'), 1), true)
       ON CONFLICT (chave) DO UPDATE SET tipo = EXCLUDED.tipo, definicao = EXCLUDED.definicao, ativo = true`,
      [JSON.stringify(definicao)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const qualified = (table: string) => `"${schema}"."${table}"`;
    await queryRunner.query(`DELETE FROM ${qualified('rbac_catalogo')} WHERE chave = 'CONFIGURAR_MODELO_ORDEM'`);
    await queryRunner.query(`DROP INDEX IF EXISTS ${qualified('UQ_ordens_teste_modelo_id')}`);
    await queryRunner.query(`DROP INDEX IF EXISTS ${qualified('UQ_modelos_codigo_produto')}`);
    await queryRunner.query(`ALTER TABLE ${qualified('rota_modelo')} DROP COLUMN IF EXISTS versao`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} DROP COLUMN IF EXISTS rota_versao`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} DROP COLUMN IF EXISTS rota_snapshot`);
    await queryRunner.query(`UPDATE ${qualified('ordens_teste')} SET possui_caixa_teste = false WHERE possui_caixa_teste IS NULL`);
    await queryRunner.query(`ALTER TABLE ${qualified('ordens_teste')} ALTER COLUMN possui_caixa_teste SET NOT NULL`);
  }
}
