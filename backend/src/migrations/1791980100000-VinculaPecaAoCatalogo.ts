import { MigrationInterface, QueryRunner } from 'typeorm';

export class VinculaPecaAoCatalogo1791980100000 implements MigrationInterface {
  name = 'VinculaPecaAoCatalogo1791980100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`ALTER TABLE "${schema}"."pecas" ADD COLUMN IF NOT EXISTS catalogo_peca_id uuid`);
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'FK_pecas_catalogo_peca'
             AND conrelid = '"${schema}"."pecas"'::regclass
         ) THEN
           ALTER TABLE "${schema}"."pecas" ADD CONSTRAINT "FK_pecas_catalogo_peca"
           FOREIGN KEY (catalogo_peca_id) REFERENCES "${schema}"."catalogo_pecas"(id)
           ON DELETE SET NULL;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pecas_modelo_catalogo"
       ON "${schema}"."pecas" (modelo_id, catalogo_peca_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."IDX_pecas_modelo_catalogo"`);
    await queryRunner.query(`ALTER TABLE "${schema}"."pecas" DROP CONSTRAINT IF EXISTS "FK_pecas_catalogo_peca"`);
    await queryRunner.query(`ALTER TABLE "${schema}"."pecas" DROP COLUMN IF EXISTS catalogo_peca_id`);
  }
}
