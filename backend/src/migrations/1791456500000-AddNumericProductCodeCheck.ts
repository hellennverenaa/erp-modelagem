import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Impede códigos de produto novos/alterados fora do formato numérico.
 * A migração não converte nem apaga dados: se encontrar histórico incompatível,
 * falha antes de alterar a tabela para permitir uma decisão de compatibilidade.
 */
export class AddNumericProductCodeCheck1791456500000 implements MigrationInterface {
  name = 'AddNumericProductCodeCheck1791456500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const table = `${quote(schema)}.${quote('modelos')}`;
    const [result] = await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM ${table}
       WHERE codigo_produto !~ '^[0-9]+$'`,
    );

    if (Number(result?.total || 0) > 0) {
      throw new Error(
        `Migration cancelada: ${result.total} código(s) histórico(s) não numérico(s) em ${schema}.modelos.codigo_produto. Nenhum dado foi alterado.`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE ${table}
       ADD CONSTRAINT "CHK_modelos_codigo_produto_numerico"
       CHECK (codigo_produto ~ '^[0-9]+$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    await queryRunner.query(
      `ALTER TABLE ${quote(schema)}.${quote('modelos')}
       DROP CONSTRAINT IF EXISTS "CHK_modelos_codigo_produto_numerico"`,
    );
  }
}
