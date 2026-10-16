import { MigrationInterface, QueryRunner } from 'typeorm';

export class DistingueFluxosDosTicketsSetor1792161300000 implements MigrationInterface {
  name = 'DistingueFluxosDosTicketsSetor1792161300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');

    await queryRunner.query(`
      CREATE TYPE "${schema}"."tickets_setor_tipo_lote_enum"
      AS ENUM ('LOTE_PRINCIPAL', 'CAIXA_TESTE')
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."tickets_setor"
      ADD COLUMN "tipo_lote" "${schema}"."tickets_setor_tipo_lote_enum"
      NOT NULL DEFAULT 'LOTE_PRINCIPAL'
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."tickets_setor"
      DROP CONSTRAINT IF EXISTS "uq_tickets_setor_ordem_setor"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."tickets_setor"
      ADD CONSTRAINT "uq_tickets_setor_ordem_setor_tipo_lote"
      UNIQUE ("ordem_teste_id", "setor_id", "tipo_lote")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const ticketsCaixaTeste = await queryRunner.query(`
      SELECT 1 FROM "${schema}"."tickets_setor"
      WHERE "tipo_lote" = 'CAIXA_TESTE'
      LIMIT 1
    `);

    if (ticketsCaixaTeste.length > 0) {
      throw new Error('Não é possível reverter a migration: existem tickets de Caixa Teste persistidos.');
    }

    await queryRunner.query(`
      ALTER TABLE "${schema}"."tickets_setor"
      DROP CONSTRAINT IF EXISTS "uq_tickets_setor_ordem_setor_tipo_lote"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."tickets_setor"
      ADD CONSTRAINT "uq_tickets_setor_ordem_setor"
      UNIQUE ("ordem_teste_id", "setor_id")
    `);
    await queryRunner.query(`ALTER TABLE "${schema}"."tickets_setor" DROP COLUMN "tipo_lote"`);
    await queryRunner.query(`DROP TYPE "${schema}"."tickets_setor_tipo_lote_enum"`);
  }
}
