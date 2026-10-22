import { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserva o escopo de planta dos novos eventos de auditoria no schema do ERP de Modelagem. */
export class AdicionaEscopoDePlantaNaAuditoria1792604703742 implements MigrationInterface {
  name = 'AdicionaEscopoDePlantaNaAuditoria1792604703742';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = '"erp_modelagem"';

    await queryRunner.query(
      `ALTER TABLE ${schema}."audit_log" ADD COLUMN "planta_id" uuid`,
    );

    // Auditorias de ordens têm planta identificável; demais registros antigos permanecem sem escopo inferido.
    await queryRunner.query(
      `UPDATE ${schema}."audit_log" AS auditoria
       SET "planta_id" = ordem."planta_id"
       FROM ${schema}."ordens_teste" AS ordem
       WHERE auditoria."entidade_tipo" = 'ordens_teste'
         AND auditoria."entidade_id" = ordem."id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "erp_modelagem"."audit_log" DROP COLUMN "planta_id"',
    );
  }
}
