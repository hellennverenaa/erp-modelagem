import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersisteSlaNaRotaModelo1791981000000 implements MigrationInterface {
  name = 'PersisteSlaNaRotaModelo1791981000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const rotas = `"${schema}"."rota_modelo"`;
    const ordens = `"${schema}"."ordens_teste"`;
    const setores = `"${schema}"."setores"`;

    await queryRunner.query(`ALTER TABLE ${rotas} ADD COLUMN "sla_alvo_min" integer NOT NULL DEFAULT 120`);
    await queryRunner.query(`
      UPDATE ${rotas} r
      SET sla_alvo_min = ROUND(COALESCE(
        NULLIF(o.slas_por_setor ->> r.setor_id::text, '')::numeric,
        NULLIF(o.rota_snapshot -> 'slasPorSetor' ->> r.setor_id::text, '')::numeric,
        NULLIF(o.slas_por_setor ->> s.nome, '')::numeric,
        NULLIF(o.rota_snapshot -> 'slasPorSetor' ->> s.nome, '')::numeric,
        r.sla_alvo_min
      ))::integer
      FROM ${ordens} o, ${setores} s
      WHERE s.id = r.setor_id
        AND o.modelo_id = r.modelo_id
        AND o.planta_id = r.planta_id
        AND COALESCE(
          o.rota_versao,
          (
            SELECT MAX(rota_atual.versao)
            FROM ${rotas} rota_atual
            WHERE rota_atual.modelo_id = r.modelo_id
              AND rota_atual.planta_id = r.planta_id
          )
        ) = r.versao
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    await queryRunner.query(`ALTER TABLE "${schema}"."rota_modelo" DROP COLUMN IF EXISTS "sla_alvo_min"`);
  }
}
