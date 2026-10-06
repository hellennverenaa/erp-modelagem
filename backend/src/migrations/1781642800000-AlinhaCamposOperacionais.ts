import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlinhaCamposOperacionais1781642800000 implements MigrationInterface {
  name = 'AlinhaCamposOperacionais1781642800000';

  private readonly columns = [
    { table: 'modelos', name: 'data_corte', type: 'timestamp' as const },
    { table: 'ordens_teste', name: 'data_prevista_producao', type: 'timestamp' as const },
    { table: 'ordens_teste', name: 'slas_por_setor', type: 'jsonb' as const },
    { table: 'rastreamentos', name: 'tempo_pausado_min', type: 'int' as const },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of this.columns) {
      if (await queryRunner.hasColumn(column.table, column.name)) continue;

      await queryRunner.addColumn(
        column.table,
        new TableColumn({
          name: column.name,
          type: column.type,
          isNullable: true,
          default: column.name === 'tempo_pausado_min' ? '0' : undefined,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [...this.columns].reverse()) {
      if (await queryRunner.hasColumn(column.table, column.name)) {
        await queryRunner.dropColumn(column.table, column.name);
      }
    }
  }
}
