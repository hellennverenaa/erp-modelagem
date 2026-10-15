import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdicionaTiposOcorrenciaProducao1791980800000 implements MigrationInterface {
  name = 'AdicionaTiposOcorrenciaProducao1791980800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schemaName = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const enumType = `${quote(schemaName)}.${quote('ocorrencias_producao_tipo_ocorrencia_enum')}`;

    await queryRunner.query(
      `ALTER TYPE ${enumType} ADD VALUE IF NOT EXISTS 'LIBERACAO_PARCIAL' BEFORE 'OUTRO'`,
    );
    await queryRunner.query(
      `ALTER TYPE ${enumType} ADD VALUE IF NOT EXISTS 'AGUARDANDO_RESPOSTA_SUL' BEFORE 'OUTRO'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schemaName = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = `${quote(schemaName)}.${quote('ocorrencias_producao')}`;
    const enumName = 'ocorrencias_producao_tipo_ocorrencia_enum';
    const enumType = `${quote(schemaName)}.${quote(enumName)}`;
    const temporaryEnumName = `${enumName}_rollback`;
    const temporaryEnumType = `${quote(schemaName)}.${quote(temporaryEnumName)}`;
    const usages = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM ${table}
       WHERE tipo_ocorrencia::text IN ('LIBERACAO_PARCIAL', 'AGUARDANDO_RESPOSTA_SUL')`,
    ) as Array<{ total: number }>;

    if (Number(usages[0]?.total ?? 0) > 0) {
      throw new Error(
        'Não é possível remover os tipos de ocorrência enquanto houver registros usando esses valores.',
      );
    }

    await queryRunner.query(
      `CREATE TYPE ${temporaryEnumType} AS ENUM (
        'GARGALO_MAQUINA', 'FALTA_MATERIAL', 'PROBLEMA_QUALIDADE',
        'BLOQUEIO_PROCESSO', 'ACIDENTE_TRABALHO', 'OUTRO'
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table} ALTER COLUMN tipo_ocorrencia TYPE ${temporaryEnumType}
       USING tipo_ocorrencia::text::${temporaryEnumType}`,
    );
    await queryRunner.query(`DROP TYPE ${enumType}`);
    await queryRunner.query(
      `ALTER TYPE ${temporaryEnumType} RENAME TO ${quote(enumName)}`,
    );
  }
}
