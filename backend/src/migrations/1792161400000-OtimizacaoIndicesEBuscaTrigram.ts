import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona índices estratégicos de performance nas tabelas de alto volume
 * (rastreamentos, inspeções, ocorrências, etapas de corte, divergências, retrabalhos)
 * e habilita busca textual otimizada via pg_trgm no catálogo de peças.
 */
export class OtimizacaoIndicesEBuscaTrigram1792161400000 implements MigrationInterface {
  name = 'OtimizacaoIndicesEBuscaTrigram1792161400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    ).replace(/"/g, '""');

    // 1. Habilita extensão pg_trgm para buscas textuais rápidas
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    // 2. Índices de Rastreamentos (atenção para "tipoLote" em camelCase)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rastreamentos_ordem_tipo_status"
      ON "${schema}"."rastreamentos" ("ordem_teste_id", "tipoLote", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rastreamentos_setor_datas"
      ON "${schema}"."rastreamentos" ("setor_id", "data_entrada", "data_saida")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rastreamentos_peca_id"
      ON "${schema}"."rastreamentos" ("peca_id")
      WHERE "peca_id" IS NOT NULL
    `);

    // 3. Índices de Inspeções de Qualidade
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inspecoes_ordem_setor"
      ON "${schema}"."inspecoes" ("ordem_teste_id", "setor_id", "resultado")
    `);

    // 4. Índices de Ocorrências de Produção
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ocorrencias_ordem_status"
      ON "${schema}"."ocorrencias_producao" ("ordem_teste_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ocorrencias_setor_data"
      ON "${schema}"."ocorrencias_producao" ("setor_id", "data_ocorrencia")
    `);

    // 5. Índices de Etapas de Corte
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_etapas_corte_rastreamento"
      ON "${schema}"."etapas_corte" ("rastreamento_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_etapa_corte_pecas_etapa"
      ON "${schema}"."etapa_corte_pecas" ("etapa_corte_id")
    `);

    // 6. Índices de Divergências e Retrabalhos
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_divergencias_ordem_setor"
      ON "${schema}"."divergencias" ("ordem_teste_id", "setor_id", "resolvido")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_retrabalhos_ordem_divergencia"
      ON "${schema}"."retrabalhos" ("ordem_teste_id", "divergencia_id", "status")
    `);

    // 7. Índices de Catálogo de Peças (Trigram GIN)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_catalogo_pecas_trgm_nome"
      ON "${schema}"."catalogo_pecas"
      USING gin ("nome" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_catalogo_pecas_codigo_original"
      ON "${schema}"."catalogo_pecas" ("codigo_original")
      WHERE "codigo_original" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    ).replace(/"/g, '""');

    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_catalogo_pecas_codigo_original"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_catalogo_pecas_trgm_nome"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_retrabalhos_ordem_divergencia"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_divergencias_ordem_setor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_etapa_corte_pecas_etapa"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_etapas_corte_rastreamento"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_ocorrencias_setor_data"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_ocorrencias_ordem_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_inspecoes_ordem_setor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_rastreamentos_peca_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_rastreamentos_setor_datas"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."idx_rastreamentos_ordem_tipo_status"`);
  }
}
