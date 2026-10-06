import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cadastra os subsetores de corte usados pelo Construtor de Rota de Modelo.
 * A migration é aditiva e idempotente para não duplicar cadastros existentes.
 */
export class CadastraSubsetoresCorteAutomatico1781642900000 implements MigrationInterface {
  name = 'CadastraSubsetoresCorteAutomatico1781642900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;

    await queryRunner.startTransaction();
    try {
      const [setorTipoCategoria] = await queryRunner.query(
        `INSERT INTO ${table('config_categorias')} (slug, nome_exibicao, descricao, ativo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (slug) DO UPDATE SET ativo = TRUE
         RETURNING id`,
        ['setor_tipo', 'Tipo de Setor', 'Categorização principal dos setores na fábrica'],
      );
      const [subsetorCategoria] = await queryRunner.query(
        `INSERT INTO ${table('config_categorias')} (slug, nome_exibicao, descricao, ativo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (slug) DO UPDATE SET ativo = TRUE
         RETURNING id`,
        ['subsetor_corte', 'Subtipo de Corte', 'Máquinas e tipos específicos de corte'],
      );

      if (!setorTipoCategoria?.id || !subsetorCategoria?.id) {
        throw new Error('Não foi possível obter as categorias de configuração dos setores.');
      }

      const subsetores = [
        { nome: 'Corte Lectra', tipo: 'CORTE_LECTRA', opcao: 'Lectra', ordem: 1, condicional: false },
        { nome: 'Corte Atom', tipo: 'CORTE_ATOM', opcao: 'Atom', ordem: 2, condicional: false },
        { nome: 'Corte CN', tipo: 'CORTE_CN', opcao: 'CN', ordem: 3, condicional: true },
        { nome: 'Corte Couro', tipo: 'CORTE_COURO', opcao: 'Couro', ordem: 4, condicional: true },
        { nome: 'Corte Laser', tipo: 'CORTE_LASER', opcao: 'Laser', ordem: 5, condicional: true },
      ];

      for (const [index, setor] of subsetores.entries()) {
        await queryRunner.query(
          `INSERT INTO ${table('config_opcoes')} (categoria_id, valor, label, ordem, ativo)
           SELECT $1, $2, $3, $4, TRUE
           WHERE NOT EXISTS (
             SELECT 1 FROM ${table('config_opcoes')}
             WHERE categoria_id = $1 AND lower(valor) = lower($2::varchar)
           )`,
          [subsetorCategoria.id, setor.opcao, setor.opcao, index + 1],
        );

        await queryRunner.query(
          `INSERT INTO ${table('config_opcoes')} (categoria_id, valor, label, ordem, ativo)
           SELECT $1, $2, $3, $4, TRUE
           WHERE NOT EXISTS (
             SELECT 1 FROM ${table('config_opcoes')}
             WHERE categoria_id = $1 AND valor = $2::varchar
           )`,
          [setorTipoCategoria.id, setor.tipo, setor.nome, index + 1],
        );

        await queryRunner.query(
          `INSERT INTO ${table('setores')}
             (planta_id, nome, tipo_opcao_id, ordem_fluxo, is_condicional, ativo)
           SELECT planta.id, $1, tipo.id, $2, $3, TRUE
           FROM ${table('plantas')} planta
           CROSS JOIN LATERAL (
             SELECT id FROM ${table('config_opcoes')}
             WHERE categoria_id = $4 AND valor = $5 AND ativo = TRUE
             ORDER BY ordem, id LIMIT 1
           ) tipo
           WHERE planta.ativo = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM ${table('setores')} existente
               WHERE existente.planta_id = planta.id
                 AND lower(trim(existente.nome)) = lower($1::varchar)
             )`,
          [setor.nome, 5, setor.condicional, setorTipoCategoria.id, setor.tipo],
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(): Promise<void> {
    // Mantém os cadastros para preservar rotas e rastreamentos já associados.
  }
}
