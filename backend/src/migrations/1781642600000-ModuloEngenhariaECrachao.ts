import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class ModuloEngenhariaECrachao1781642600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar coluna codigo_crachao em usuarios (se ainda não existir)
    const usuariosTable = await queryRunner.getTable('usuarios');
    if (usuariosTable && !usuariosTable.findColumnByName('codigo_crachao')) {
      await queryRunner.addColumn(
        'usuarios',
        new TableColumn({
          name: 'codigo_crachao',
          type: 'varchar',
          length: '50',
          isUnique: true,
          isNullable: true,
        })
      );
    }

    // 2. Criar tabela catalogo_pecas
    await queryRunner.createTable(
      new Table({
        name: 'catalogo_pecas',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'numero',
            type: 'varchar',
            length: '50',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'nome',
            type: 'varchar',
            length: '200',
            isNullable: false,
          },
          {
            name: 'codigo_original',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'descricao',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ativo',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // 3. Criar tabela catalogo_itens_checklist
    await queryRunner.createTable(
      new Table({
        name: 'catalogo_itens_checklist',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'setor_tipo_opcao_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'numero_item',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'descricao',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'tipo_resposta',
            type: 'varchar',
            length: '50',
            default: "'OK_NA_PENDENTE'",
          },
          {
            name: 'obrigatorio',
            type: 'boolean',
            default: true,
          },
          {
            name: 'ordem',
            type: 'int',
            default: 0,
          },
          {
            name: 'ativo',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'catalogo_itens_checklist',
      new TableForeignKey({
        columnNames: ['setor_tipo_opcao_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'config_opcoes',
        onDelete: 'RESTRICT',
      })
    );

    // 4. Criar enum e tabela etapa_corte_pecas
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "etapa_corte_pecas_resultado_conformidade_enum" AS ENUM('OK', 'NAO_OK');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`
    );

    await queryRunner.createTable(
      new Table({
        name: 'etapa_corte_pecas',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'etapa_corte_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'peca_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'resultado_conformidade',
            type: 'etapa_corte_pecas_resultado_conformidade_enum',
            isNullable: false,
          },
          {
            name: 'observacao',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'etapa_corte_pecas',
      new TableForeignKey({
        columnNames: ['etapa_corte_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'etapas_corte',
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'etapa_corte_pecas',
      new TableForeignKey({
        columnNames: ['peca_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'pecas',
        onDelete: 'RESTRICT',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('etapa_corte_pecas');
    await queryRunner.query(`DROP TYPE IF EXISTS "etapa_corte_pecas_resultado_conformidade_enum"`);
    await queryRunner.dropTable('catalogo_itens_checklist');
    await queryRunner.dropTable('catalogo_pecas');
    
    const usuariosTable = await queryRunner.getTable('usuarios');
    if (usuariosTable && usuariosTable.findColumnByName('codigo_crachao')) {
      await queryRunner.dropColumn('usuarios', 'codigo_crachao');
    }
  }
}
