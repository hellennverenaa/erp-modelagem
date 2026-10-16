import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersisteRemanejamentoPecaPorOrdem1791981200000 implements MigrationInterface {
  name = 'PersisteRemanejamentoPecaPorOrdem1791981200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const ordens = `"${schema}"."ordens_teste"`;
    const pecas = `"${schema}"."pecas"`;
    const auditoria = `"${schema}"."audit_log"`;

    await queryRunner.query(`ALTER TABLE ${ordens} ADD COLUMN "pecas_remanejadas" jsonb`);

    // Preserva os remanejamentos feitos pela versão anterior, que os gravava na peça do modelo.
    await queryRunner.query(`
      WITH eventos AS (
        SELECT
          entidade_id AS ordem_id,
          dados_novos ->> 'pecaId' AS peca_id_text,
          dados_anteriores ->> 'maquinaId' AS origem_id_text,
          dados_novos ->> 'maquinaId' AS destino_id_text,
          ROW_NUMBER() OVER (
            PARTITION BY entidade_id, dados_novos ->> 'pecaId'
            ORDER BY created_at ASC, id ASC
          ) AS primeiro_evento,
          ROW_NUMBER() OVER (
            PARTITION BY entidade_id, dados_novos ->> 'pecaId'
            ORDER BY created_at DESC, id DESC
          ) AS ultimo_evento
        FROM ${auditoria}
        WHERE entidade_tipo = 'ordens_teste'
          AND acao = 'PECA_REMANEJADA'
          AND dados_novos ->> 'pecaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND dados_anteriores ->> 'maquinaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND dados_novos ->> 'maquinaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ),
      primeiras AS (
        SELECT ordem_id, peca_id_text, origem_id_text
        FROM eventos
        WHERE primeiro_evento = 1
      ),
      ultimas AS (
        SELECT ordem_id, peca_id_text, destino_id_text
        FROM eventos
        WHERE ultimo_evento = 1
      ),
      estado_final AS (
        SELECT
          ultimas.ordem_id,
          ultimas.peca_id_text::uuid AS peca_id,
          primeiras.origem_id_text::uuid AS origem_id,
          ultimas.destino_id_text::uuid AS destino_id
        FROM ultimas
        INNER JOIN primeiras USING (ordem_id, peca_id_text)
      ),
      mapas AS (
        SELECT
          ordem_id,
          jsonb_object_agg(peca_id::text, destino_id::text)
            FILTER (WHERE destino_id <> origem_id) AS pecas_remanejadas
        FROM estado_final
        GROUP BY ordem_id
      )
      UPDATE ${ordens} AS ordem
      SET pecas_remanejadas = mapas.pecas_remanejadas
      FROM mapas
      WHERE ordem.id = mapas.ordem_id
    `);

    // Restaura o destino original no cadastro compartilhado do modelo quando há uma única ordem.
    await queryRunner.query(`
      WITH primeiras AS (
        SELECT DISTINCT ON (ordem.modelo_id, auditoria.dados_novos ->> 'pecaId')
          ordem.modelo_id,
          (auditoria.dados_novos ->> 'pecaId')::uuid AS peca_id,
          (auditoria.dados_anteriores ->> 'maquinaId')::uuid AS origem_id
        FROM ${auditoria} AS auditoria
        INNER JOIN ${ordens} AS ordem ON ordem.id = auditoria.entidade_id
        WHERE auditoria.entidade_tipo = 'ordens_teste'
          AND auditoria.acao = 'PECA_REMANEJADA'
          AND auditoria.dados_novos ->> 'pecaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND auditoria.dados_anteriores ->> 'maquinaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ORDER BY ordem.modelo_id, auditoria.dados_novos ->> 'pecaId', auditoria.created_at ASC, auditoria.id ASC
      ),
      modelos_com_uma_ordem AS (
        SELECT modelo_id
        FROM ${ordens}
        GROUP BY modelo_id
        HAVING COUNT(*) = 1
      )
      UPDATE ${pecas} AS peca
      SET setor_corte_opcao_id = primeiras.origem_id
      FROM primeiras
      INNER JOIN modelos_com_uma_ordem USING (modelo_id)
      WHERE peca.id = primeiras.peca_id
        AND peca.modelo_id = primeiras.modelo_id
        AND peca.setor_corte_opcao_id <> primeiras.origem_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem').replace(/"/g, '""');
    const ordens = `"${schema}"."ordens_teste"`;
    const pecas = `"${schema}"."pecas"`;

    await queryRunner.query(`
      WITH ordens_unicas AS (
        SELECT modelo_id
        FROM ${ordens}
        GROUP BY modelo_id
        HAVING COUNT(*) = 1
      ),
      remanejamentos AS (
        SELECT ordem.modelo_id, entrada.key::uuid AS peca_id, entrada.value::uuid AS destino_id
        FROM ${ordens} AS ordem
        INNER JOIN ordens_unicas USING (modelo_id)
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(ordem.pecas_remanejadas, '{}'::jsonb)) AS entrada
      )
      UPDATE ${pecas} AS peca
      SET setor_corte_opcao_id = remanejamentos.destino_id
      FROM remanejamentos
      WHERE peca.id = remanejamentos.peca_id
        AND peca.modelo_id = remanejamentos.modelo_id
    `);

    await queryRunner.query(`ALTER TABLE ${ordens} DROP COLUMN IF EXISTS "pecas_remanejadas"`);
  }
}
