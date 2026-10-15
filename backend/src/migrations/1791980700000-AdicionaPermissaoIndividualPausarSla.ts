import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdicionaPermissaoIndividualPausarSla1791980700000 implements MigrationInterface {
  name = 'AdicionaPermissaoIndividualPausarSla1791980700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem');
    const table = `"${schema.replace(/"/g, '""')}"."usuarios"`;
    await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN "pode_interromper_sla" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem');
    const table = `"${schema.replace(/"/g, '""')}"."usuarios"`;
    await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN "pode_interromper_sla"`);
  }
}
