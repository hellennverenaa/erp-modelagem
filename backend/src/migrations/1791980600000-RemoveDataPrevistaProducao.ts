import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDataPrevistaProducao1791980600000 implements MigrationInterface {
  name = 'RemoveDataPrevistaProducao1791980600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    ).replace(/"/g, '""');

    await queryRunner.query(
      `ALTER TABLE "${schema}"."ordens_teste" DROP COLUMN IF EXISTS "data_prevista_producao"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    ).replace(/"/g, '""');

    await queryRunner.query(
      `ALTER TABLE "${schema}"."ordens_teste" ADD COLUMN IF NOT EXISTS "data_prevista_producao" timestamp`,
    );
  }
}
