import { MigrationInterface, QueryRunner } from "typeorm";

export class OtimizacaoEtiquetas1781642500000 implements MigrationInterface {
    name = 'OtimizacaoEtiquetas1781642500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ordens_teste_modelo_planta ON ordens_teste (modelo_id, planta_id, status);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_pecas_modelo_corte ON pecas (modelo_id, setor_corte_opcao_id);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_ordens_teste_modelo_planta;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pecas_modelo_corte;`);
    }
}
