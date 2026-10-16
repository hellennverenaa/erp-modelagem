import { MigrationInterface, QueryRunner } from 'typeorm';

export class CriaTicketsPorSetor1792161206278 implements MigrationInterface {
  name = 'CriaTicketsPorSetor1792161206278';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`
      CREATE TABLE "${schema}"."tickets_setor" (
        "id" uuid NOT NULL,
        "codigo_barras" character varying(64) NOT NULL,
        "ordem_teste_id" uuid NOT NULL,
        "setor_id" uuid NOT NULL,
        "rota_versao" integer NOT NULL,
        "ordem_etapa" integer NOT NULL,
        "setor_nome_snapshot" character varying(150) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tickets_setor" PRIMARY KEY ("id"),
        CONSTRAINT "uq_tickets_setor_codigo_barras" UNIQUE ("codigo_barras"),
        CONSTRAINT "uq_tickets_setor_ordem_setor" UNIQUE ("ordem_teste_id", "setor_id"),
        CONSTRAINT "fk_tickets_setor_ordem" FOREIGN KEY ("ordem_teste_id")
          REFERENCES "${schema}"."ordens_teste"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_tickets_setor_setor" FOREIGN KEY ("setor_id")
          REFERENCES "${schema}"."setores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tickets_setor_ordem_etapa" ON "${schema}"."tickets_setor" ("ordem_teste_id", "ordem_etapa")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."tickets_setor"`);
  }
}
