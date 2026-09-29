import { MigrationInterface, QueryRunner } from "typeorm";

export class OtimizacaoEtiquetas1781642500000 implements MigrationInterface {
    name = 'OtimizacaoEtiquetas1781642500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.DB_SCHEMA || 'erp_modelagem';
        const quotedSchema = `"${schema.replace(/"/g, '""')}"`;
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ordens_teste_modelo_planta ON ${quotedSchema}."ordens_teste" (modelo_id, planta_id, status);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_pecas_modelo_corte ON ${quotedSchema}."pecas" (modelo_id, setor_corte_opcao_id);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.DB_SCHEMA || 'erp_modelagem';
        const quotedSchema = `"${schema.replace(/"/g, '""')}"`;
        await queryRunner.query(`DROP INDEX IF EXISTS ${quotedSchema}.idx_ordens_teste_modelo_planta;`);
        await queryRunner.query(`DROP INDEX IF EXISTS ${quotedSchema}.idx_pecas_modelo_corte;`);
    }
}
