import { MigrationInterface, QueryRunner } from 'typeorm';

export class RotaModeloPorPlanta1791980200000 implements MigrationInterface {
  name = 'RotaModeloPorPlanta1791980200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const rota = `"${schema}"."rota_modelo"`;
    await queryRunner.query(`ALTER TABLE ${rota} ADD COLUMN planta_id uuid`);
    await queryRunner.query(
      `UPDATE ${rota} r SET planta_id = s.planta_id
       FROM "${schema}"."setores" s WHERE s.id = r.setor_id`,
    );
    await queryRunner.query(`ALTER TABLE ${rota} ALTER COLUMN planta_id SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE ${rota} ADD CONSTRAINT "FK_rota_modelo_planta"
       FOREIGN KEY (planta_id) REFERENCES "${schema}"."plantas"(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rota_modelo_modelo_planta" ON ${rota} (modelo_id, planta_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."IDX_rota_modelo_modelo_planta"`);
    await queryRunner.query(`ALTER TABLE "${schema}"."rota_modelo" DROP CONSTRAINT IF EXISTS "FK_rota_modelo_planta"`);
    await queryRunner.query(`ALTER TABLE "${schema}"."rota_modelo" DROP COLUMN IF EXISTS planta_id`);
  }
}
