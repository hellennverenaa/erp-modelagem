import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlinhaCredenciaisUsuario1781642700000 implements MigrationInterface {
  name = 'AlinhaCredenciaisUsuario1781642700000';

  private readonly columns = [
    { name: 'codigo_cracha', constraint: 'UQ_usuarios_codigo_cracha' },
    { name: 'rfid', constraint: 'UQ_usuarios_rfid' },
    { name: 'codigo_barras_cracha', constraint: 'UQ_usuarios_codigo_barras_cracha' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of this.columns) {
      if (await queryRunner.hasColumn('usuarios', column.name)) continue;

      await queryRunner.addColumn(
        'usuarios',
        new TableColumn({
          name: column.name,
          type: 'varchar',
          length: '50',
          isNullable: true,
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [...this.columns].reverse()) {
      if (await queryRunner.hasColumn('usuarios', column.name)) {
        await queryRunner.dropColumn('usuarios', column.name);
      }
    }
  }
}
