import { unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { AppDataSource } from '../config/database';

const schema = '"erp_modelagem"';
const removedTypes = ['CORTE_RECEBIMENTO', 'CORTE_SEPARACAO', 'SEPARACAO_CORTE'];
const removedNames = ['CORTE RECEBIMENTO', 'CORTE SEPARAÇÃO', 'CORTE SEPARACAO'];
const removedSnapshotKeys = [
  ...removedTypes,
  'Corte Recebimento',
  'Corte Separação',
  'Corte Separacao',
];

function getArgument(prefix: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function configuredDatabaseName(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não configurada.');
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''));
}

function requireTestDatabaseConfirmation(): string {
  const confirmedDatabase = getArgument('--confirm-test-database=');
  const confirmedSchema = getArgument('--confirm-schema=');
  const configuredDatabase = configuredDatabaseName();

  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('A limpeza não pode ser executada com NODE_ENV=production.');
  }
  if (!confirmedDatabase || confirmedDatabase !== configuredDatabase) {
    throw new Error('Confirme o banco de testes com --confirm-test-database=<nome-do-banco>.');
  }
  if (confirmedSchema !== 'erp_modelagem') {
    throw new Error('Confirme o schema alvo com --confirm-schema=erp_modelagem.');
  }

  return configuredDatabase;
}

async function main(): Promise<void> {
  const confirmedDatabase = requireTestDatabaseConfirmation();
  await AppDataSource.initialize();

  let caminhosArquivos: string[] = [];
  let resultados: Record<string, number> = {};
  try {
    const [alvoConectado] = await AppDataSource.query(
      'SELECT current_database() AS database, current_schema() AS schema',
    );
    if (alvoConectado.database !== confirmedDatabase || alvoConectado.schema !== 'erp_modelagem') {
      throw new Error('A conexão aberta não corresponde ao banco de testes e schema confirmados.');
    }

    const limpeza = await AppDataSource.transaction(async (manager) => {
      await manager.query('CREATE TEMP TABLE purge_setor_ids (id uuid PRIMARY KEY) ON COMMIT DROP');
      await manager.query('CREATE TEMP TABLE purge_opcao_ids (id uuid PRIMARY KEY) ON COMMIT DROP');
      await manager.query('CREATE TEMP TABLE purge_relacionados (tabela text NOT NULL, id uuid NOT NULL, PRIMARY KEY (tabela, id)) ON COMMIT DROP');

      await manager.query(
        `INSERT INTO pg_temp.purge_opcao_ids (id)
         SELECT opcao.id
         FROM ${schema}."config_opcoes" opcao
         INNER JOIN ${schema}."config_categorias" categoria ON categoria.id = opcao.categoria_id
         WHERE categoria.slug = 'setor_tipo'
           AND (
             upper(trim(opcao.valor)) = ANY($1::varchar[])
             OR upper(trim(opcao.label)) = ANY($2::varchar[])
           )`,
        [removedTypes, removedNames],
      );
      await manager.query(
        `INSERT INTO pg_temp.purge_setor_ids (id)
         SELECT setor.id
         FROM ${schema}."setores" setor
         LEFT JOIN pg_temp.purge_opcao_ids opcao ON opcao.id = setor.tipo_opcao_id
         WHERE opcao.id IS NOT NULL OR upper(trim(setor.nome)) = ANY($1::varchar[])`,
        [removedNames],
      );
      await manager.query(
        `INSERT INTO pg_temp.purge_opcao_ids (id)
         SELECT DISTINCT setor.tipo_opcao_id
         FROM ${schema}."setores" setor
         WHERE setor.id IN (SELECT id FROM pg_temp.purge_setor_ids)
         ON CONFLICT (id) DO NOTHING`,
      );

      const setores = await manager.query('SELECT id FROM pg_temp.purge_setor_ids');
      const setorIds = setores.map((row: { id: string }) => row.id);
      const opcoesCompartilhadas = await manager.query(
        `SELECT COUNT(*)::int AS total
         FROM ${schema}."setores" setor
         WHERE setor.tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids)
           AND setor.id NOT IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      if (opcoesCompartilhadas[0]?.total > 0) {
        throw new Error('Uma opção de setor alvo também está vinculada a outro setor; limpeza cancelada.');
      }

      const capturarIds = async (tabela: string, selectSql: string): Promise<void> => {
        await manager.query(
          `INSERT INTO pg_temp.purge_relacionados (tabela, id)
           SELECT $1, relacionado.id FROM (${selectSql}) relacionado
           ON CONFLICT (tabela, id) DO NOTHING`,
          [tabela],
        );
      };
      await capturarIds('setores', 'SELECT id FROM pg_temp.purge_setor_ids');
      await capturarIds('config_opcoes', 'SELECT id FROM pg_temp.purge_opcao_ids');
      await capturarIds('checklist_templates',
        `SELECT id FROM ${schema}."checklist_templates" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids)`,
      );
      await capturarIds('inspecoes',
        `SELECT id FROM ${schema}."inspecoes" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('rastreamentos',
        `SELECT id FROM ${schema}."rastreamentos" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('estacoes_trabalho',
        `SELECT id FROM ${schema}."estacoes_trabalho" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('checklists',
        `SELECT id FROM ${schema}."checklists"
         WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
            OR template_id IN (SELECT id FROM ${schema}."checklist_templates" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids))`,
      );
      await capturarIds('divergencias',
        `SELECT id FROM ${schema}."divergencias"
         WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
            OR inspecao_id IN (SELECT id FROM ${schema}."inspecoes" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids))`,
      );
      await capturarIds('retrabalhos',
        `SELECT id FROM ${schema}."retrabalhos"
         WHERE setor_origem_id IN (SELECT id FROM pg_temp.purge_setor_ids)
            OR setor_destino_id IN (SELECT id FROM pg_temp.purge_setor_ids)
            OR divergencia_id IN (SELECT id FROM ${schema}."divergencias"
                WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
                   OR inspecao_id IN (SELECT id FROM ${schema}."inspecoes" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)))`,
      );
      await capturarIds('ocorrencias_producao',
        `SELECT id FROM ${schema}."ocorrencias_producao"
         WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
            OR rastreamento_id IN (SELECT id FROM ${schema}."rastreamentos" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids))`,
      );
      await capturarIds('rota_modelo',
        `SELECT id FROM ${schema}."rota_modelo" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('tickets_setor',
        `SELECT id FROM ${schema}."tickets_setor" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('validacoes_setor',
        `SELECT id FROM ${schema}."validacoes_setor" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('perfil_permissoes',
        `SELECT id FROM ${schema}."perfil_permissoes" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)`,
      );
      await capturarIds('catalogo_itens_checklist',
        `SELECT id FROM ${schema}."catalogo_itens_checklist" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids)`,
      );
      await capturarIds('checklist_template_itens',
        `SELECT id FROM ${schema}."checklist_template_itens" WHERE template_id IN (
           SELECT id FROM ${schema}."checklist_templates" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids)
         )`,
      );
      await capturarIds('checklist_itens',
        `SELECT id FROM ${schema}."checklist_itens" WHERE checklist_id IN (
           SELECT id FROM ${schema}."checklists"
           WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
              OR template_id IN (SELECT id FROM ${schema}."checklist_templates" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids))
         )`,
      );
      await capturarIds('etapas_corte',
        `SELECT id FROM ${schema}."etapas_corte" WHERE rastreamento_id IN (
           SELECT id FROM ${schema}."rastreamentos" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
         ) OR estacao_id IN (SELECT id FROM ${schema}."estacoes_trabalho" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids))`,
      );
      await capturarIds('etapa_corte_pecas',
        `SELECT id FROM ${schema}."etapa_corte_pecas" WHERE etapa_corte_id IN (
           SELECT id FROM ${schema}."etapas_corte" WHERE rastreamento_id IN (
             SELECT id FROM ${schema}."rastreamentos" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
           ) OR estacao_id IN (SELECT id FROM ${schema}."estacoes_trabalho" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids))
         )`,
      );
      await capturarIds('etapas_apoio',
        `SELECT id FROM ${schema}."etapas_apoio" WHERE rastreamento_id IN (
           SELECT id FROM ${schema}."rastreamentos" WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
         )`,
      );
      await capturarIds('emails',
        `SELECT id FROM ${schema}."emails" WHERE checklist_id IN (
           SELECT id FROM ${schema}."checklists"
           WHERE setor_id IN (SELECT id FROM pg_temp.purge_setor_ids)
              OR template_id IN (SELECT id FROM ${schema}."checklist_templates" WHERE setor_tipo_opcao_id IN (SELECT id FROM pg_temp.purge_opcao_ids))
         )`,
      );

      const anexos = await manager.query(
        `SELECT caminho_arquivo FROM ${schema}."anexos"
         WHERE entidade_id IN (SELECT id FROM pg_temp.purge_relacionados)`,
      );
      const arquivos = anexos.map((row: { caminho_arquivo: string }) => row.caminho_arquivo);

      const apagadas: Record<string, number> = {};
      const apagarPorId = async (tabela: string): Promise<void> => {
        const rows = await manager.query(
          `DELETE FROM ${schema}."${tabela}"
           WHERE id IN (SELECT id FROM pg_temp.purge_relacionados WHERE tabela = $1)
           RETURNING id`,
          [tabela],
        );
        apagadas[tabela] = rows.length;
      };
      const apagarSql = async (tabela: string, sql: string): Promise<void> => {
        const rows = await manager.query(sql);
        apagadas[tabela] = rows.length;
      };

      const tabelasParaRemover = [
        'emails',
        'checklist_itens',
        'checklists',
        'checklist_template_itens',
        'checklist_templates',
        'catalogo_itens_checklist',
        'retrabalhos',
        'divergencias',
        'ocorrencias_producao',
        'etapa_corte_pecas',
        'etapas_corte',
        'etapas_apoio',
        'inspecoes',
        'validacoes_setor',
        'tickets_setor',
        'rastreamentos',
        'rota_modelo',
        'perfil_permissoes',
        'estacoes_trabalho',
      ];
      for (const tabela of tabelasParaRemover) await apagarPorId(tabela);

      const idsSetor = setorIds;
      await manager.query(
        `UPDATE ${schema}."ordens_teste" ordem
         SET rota_snapshot = jsonb_set(
               jsonb_set(
                 ordem.rota_snapshot,
                 '{etapas}',
                 COALESCE((
                   SELECT jsonb_agg(etapa.value ORDER BY etapa.ordinalidade)
                   FROM jsonb_array_elements(COALESCE(ordem.rota_snapshot->'etapas', '[]'::jsonb)) WITH ORDINALITY etapa(value, ordinalidade)
                   WHERE COALESCE(etapa.value->>'setorId', '') <> ALL($1::varchar[])
                     AND upper(trim(COALESCE(etapa.value->>'nome', ''))) <> ALL($2::varchar[])
                 ), '[]'::jsonb),
                 TRUE
               ),
               '{slasPorSetor}',
               COALESCE(ordem.rota_snapshot->'slasPorSetor', '{}'::jsonb) - $3::text[],
               TRUE
             ),
             slas_por_setor = CASE
               WHEN ordem.slas_por_setor IS NULL THEN NULL
               ELSE ordem.slas_por_setor - $3::text[]
             END
         WHERE (ordem.rota_snapshot IS NOT NULL OR ordem.slas_por_setor IS NOT NULL)
           AND (
             EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(ordem.rota_snapshot->'etapas', '[]'::jsonb)) etapa
               WHERE COALESCE(etapa->>'setorId', '') = ANY($1::varchar[])
                  OR upper(trim(COALESCE(etapa->>'nome', ''))) = ANY($2::varchar[])
             )
             OR COALESCE(ordem.rota_snapshot->'slasPorSetor', '{}'::jsonb) ?| $3::text[]
             OR COALESCE(ordem.slas_por_setor, '{}'::jsonb) ?| $3::text[]
           )
         RETURNING ordem.id`,
        [idsSetor, removedNames, [...idsSetor, ...removedSnapshotKeys]],
      ).then((rows: unknown[]) => { apagadas['ordens_teste_snapshots'] = rows.length; });

      await apagarSql('audit_log', `DELETE FROM ${schema}."audit_log" WHERE entidade_id IN (SELECT id FROM pg_temp.purge_relacionados) RETURNING id`);
      await apagarSql('anexos', `DELETE FROM ${schema}."anexos" WHERE entidade_id IN (SELECT id FROM pg_temp.purge_relacionados) RETURNING id`);
      await apagarSql('setores', `DELETE FROM ${schema}."setores" WHERE id IN (SELECT id FROM pg_temp.purge_setor_ids) RETURNING id`);
      await apagarSql('config_opcoes', `DELETE FROM ${schema}."config_opcoes" WHERE id IN (SELECT id FROM pg_temp.purge_opcao_ids) RETURNING id`);

      return { caminhosArquivos: arquivos, resultados: apagadas };
    });

    caminhosArquivos = limpeza.caminhosArquivos;
    resultados = limpeza.resultados;
  } finally {
    await AppDataSource.destroy();
  }

  const backendRoot = path.resolve(__dirname, '../..');
  const uploadsRoot = path.resolve(backendRoot, 'uploads');
  let arquivosRemovidos = 0;
  let arquivosPendentes = 0;
  for (const caminho of caminhosArquivos) {
    const arquivo = path.resolve(backendRoot, caminho);
    const relativo = path.relative(uploadsRoot, arquivo);
    if (!relativo || relativo.startsWith('..') || path.isAbsolute(relativo)) {
      arquivosPendentes++;
      continue;
    }
    try {
      await unlink(arquivo);
      arquivosRemovidos++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') arquivosPendentes++;
    }
  }

  console.log(JSON.stringify({
    schema: 'erp_modelagem',
    resultados,
    arquivosRemovidos,
    arquivosPendentes,
  }, null, 2));
}

main().catch(() => {
  console.error('Limpeza abortada. Verifique a confirmação do banco de testes, o schema e o estado da conexão.');
  process.exitCode = 1;
});
