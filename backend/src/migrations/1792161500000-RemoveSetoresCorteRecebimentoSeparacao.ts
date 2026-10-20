import { MigrationInterface, QueryRunner } from 'typeorm';

/** Desativa os dois setores somente no schema do ERP de Modelagem. */
export class RemoveSetoresCorteRecebimentoSeparacao1792161500000 implements MigrationInterface {
  name = 'RemoveSetoresCorteRecebimentoSeparacao1792161500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = '"erp_modelagem"';
    const tiposRemovidos = ['CORTE_RECEBIMENTO', 'CORTE_SEPARACAO', 'SEPARACAO_CORTE'];
    const nomesRemovidos = [
      'CORTE RECEBIMENTO',
      'CORTE SEPARAÇÃO',
      'CORTE SEPARACAO',
    ];

    await queryRunner.query(
      `UPDATE ${schema}."config_opcoes" opcao
       SET ativo = FALSE
       FROM ${schema}."config_categorias" categoria
       WHERE categoria.id = opcao.categoria_id
         AND categoria.slug = 'setor_tipo'
         AND (
           upper(trim(opcao.valor)) = ANY($1::varchar[])
           OR upper(trim(opcao.label)) = ANY($2::varchar[])
         )`,
      [tiposRemovidos, nomesRemovidos],
    );

    await queryRunner.query(
      `UPDATE ${schema}."setores" setor
       SET ativo = FALSE
       WHERE upper(trim(setor.nome)) = ANY($1::varchar[])
          OR setor.tipo_opcao_id IN (
            SELECT opcao.id
            FROM ${schema}."config_opcoes" opcao
            INNER JOIN ${schema}."config_categorias" categoria ON categoria.id = opcao.categoria_id
            WHERE categoria.slug = 'setor_tipo'
              AND (
                upper(trim(opcao.valor)) = ANY($2::varchar[])
                OR upper(trim(opcao.label)) = ANY($1::varchar[])
              )
          )`,
      [nomesRemovidos, tiposRemovidos],
    );
  }

  public async down(): Promise<void> {
    // Não reativa setores: eles podem ter sido desativados por outra regra operacional.
  }
}
