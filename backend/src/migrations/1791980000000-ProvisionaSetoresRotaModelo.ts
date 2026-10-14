import { MigrationInterface, QueryRunner } from 'typeorm';

/** Alinha o catálogo operacional aos setores que o Construtor pode persistir. */
export class ProvisionaSetoresRotaModelo1791980000000 implements MigrationInterface {
  name = 'ProvisionaSetoresRotaModelo1791980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem');
    const table = (name: string) => `"${schema.replace(/"/g, '""')}"."${name}"`;
    const [tipoCategoria] = await queryRunner.query(
      `INSERT INTO ${table('config_categorias')} (slug, nome_exibicao, descricao, ativo)
       VALUES ('setor_tipo', 'Tipo de Setor', 'Etapas do fluxo de produção', TRUE)
       ON CONFLICT (slug) DO UPDATE SET ativo = TRUE RETURNING id`,
    );
    const [corteCategoria] = await queryRunner.query(
      `INSERT INTO ${table('config_categorias')} (slug, nome_exibicao, descricao, ativo)
       VALUES ('subsetor_corte', 'Subtipo de Corte', 'Máquinas e tipos de corte', TRUE)
       ON CONFLICT (slug) DO UPDATE SET ativo = TRUE RETURNING id`,
    );

    await queryRunner.query(
      `UPDATE ${table('config_opcoes')} SET ativo = TRUE
       WHERE categoria_id = $1 AND lower(valor) = 'ponte'`,
      [corteCategoria.id],
    );
    await queryRunner.query(
      `INSERT INTO ${table('config_opcoes')} (categoria_id, valor, label, ordem, ativo)
       SELECT $1, 'Ponte', 'Ponte', 3, TRUE
       WHERE NOT EXISTS (SELECT 1 FROM ${table('config_opcoes')}
                         WHERE categoria_id = $1 AND lower(valor) = 'ponte')`,
      [corteCategoria.id],
    );

    const setores = [
      ['Almoxarifado da Modelagem', 'ALMOXARIFADO_MODELAGEM', 1, false],
      ['Navalha', 'NAVALHA', 1, false],
      ['Telas', 'TELAS', 1, true],
      ['Corte Recebimento', 'CORTE_RECEBIMENTO', 2, false],
      ['Corte Separação', 'CORTE_SEPARACAO', 3, false],
      ['Corte Dublagem', 'CORTE_DUBLAGEM', 4, false],
      ['Corte Ponte', 'CORTE_PONTE', 5, false],
      ['Corte Lectra', 'CORTE_LECTRA', 5, false],
      ['Corte Atom', 'CORTE_ATOM', 5, true],
      ['Corte CN', 'CORTE_CN', 5, true],
      ['Corte Couro', 'CORTE_COURO', 5, true],
      ['Corte Laser', 'CORTE_LASER', 5, true],
      ['Serigrafia', 'SERIGRAFIA', 6, true],
      ['Apoio', 'APOIO', 7, false],
      ['Bordado', 'BORDADO', 8, true],
      ['Costura Programada', 'COSTURA_PROGRAMADA', 8, true],
      ['Costura', 'COSTURA', 9, false],
      ['Pré-Fabricado', 'PRE_FABRICADO', 10, true],
      ['Montagem', 'MONTAGEM', 11, false],
      ['Vulcanizado', 'VULCANIZADO', 11, true],
      ['Laboratório', 'LABORATORIO', 12, false],
    ] as const;

    for (const [nome, tipo, ordem, condicional] of setores) {
      await queryRunner.query(
        `UPDATE ${table('config_opcoes')}
         SET ativo = TRUE, label = $3, ordem = $4
         WHERE categoria_id = $1 AND lower(valor) = lower($2)`,
        [tipoCategoria.id, tipo, nome, ordem],
      );
      await queryRunner.query(
        `INSERT INTO ${table('config_opcoes')} (categoria_id, valor, label, ordem, ativo)
         SELECT $1, $2, $3, $4, TRUE
         WHERE NOT EXISTS (SELECT 1 FROM ${table('config_opcoes')}
                           WHERE categoria_id = $1 AND lower(valor) = lower($2::varchar))`,
        [tipoCategoria.id, tipo, nome, ordem],
      );
      await queryRunner.query(
        `UPDATE ${table('setores')} setor
         SET ativo = TRUE, tipo_opcao_id = tipo.id, ordem_fluxo = $2, is_condicional = $3
         FROM ${table('plantas')} planta
         CROSS JOIN LATERAL (
           SELECT opcao.id FROM ${table('config_opcoes')} opcao
           WHERE opcao.categoria_id = $4 AND lower(opcao.valor) = lower($5) AND opcao.ativo = TRUE
           ORDER BY opcao.id LIMIT 1
         ) tipo
         WHERE planta.ativo = TRUE
           AND setor.planta_id = planta.id
           AND lower(trim(setor.nome)) = lower($1::varchar)`,
        [nome, ordem, condicional, tipoCategoria.id, tipo],
      );
      await queryRunner.query(
        `INSERT INTO ${table('setores')}
           (planta_id, nome, tipo_opcao_id, ordem_fluxo, is_condicional, ativo)
         SELECT planta.id, $1, tipo.id, $2, $3, TRUE
         FROM ${table('plantas')} planta
         CROSS JOIN LATERAL (
           SELECT opcao.id FROM ${table('config_opcoes')} opcao
           WHERE opcao.categoria_id = $4 AND lower(opcao.valor) = lower($5) AND opcao.ativo = TRUE
           ORDER BY opcao.id LIMIT 1
         ) tipo
         WHERE planta.ativo = TRUE
           AND NOT EXISTS (SELECT 1 FROM ${table('setores')} existente
                           WHERE existente.planta_id = planta.id
                             AND lower(trim(existente.nome)) = lower($1::varchar))`,
        [nome, ordem, condicional, tipoCategoria.id, tipo],
      );
    }
  }

  public async down(): Promise<void> {
    // Setores podem estar associados a rotas e rastreamentos históricos.
  }
}
