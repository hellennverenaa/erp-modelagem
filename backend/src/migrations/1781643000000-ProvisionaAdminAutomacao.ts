import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERFIL_ADMIN_AUTOMACAO, USUARIOS_ADMIN_AUTOMACAO } from '../config/rbac.constants';

export class ProvisionaAdminAutomacao1781643000000 implements MigrationInterface {
  name = 'ProvisionaAdminAutomacao1781643000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `INSERT INTO ${table('perfis')} (nome, descricao, permissoes, ativo)
         VALUES ($1, $2, '{}'::jsonb, TRUE)
         ON CONFLICT (nome) DO UPDATE
           SET descricao = EXCLUDED.descricao,
               ativo = TRUE,
               updated_at = now()`,
        [PERFIL_ADMIN_AUTOMACAO, 'Gestão de perfis e permissões da equipe de automação.'],
      );

      await queryRunner.query(
        `UPDATE ${table('usuarios')} AS usuario
         SET perfil_id = perfil.id, updated_at = now()
         FROM ${table('perfis')} AS perfil
         WHERE perfil.nome = $1
           AND lower(trim(usuario.usuario)) = ANY($2::varchar[])`,
        [PERFIL_ADMIN_AUTOMACAO, Array.from(USUARIOS_ADMIN_AUTOMACAO)],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = String(
      (queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem',
    );
    const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const table = (name: string) => `${q(schema)}.${q(name)}`;

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `INSERT INTO ${table('perfis')} (nome, descricao, permissoes, ativo)
         VALUES ('OPERADOR', 'Perfil padrão de operador de fábrica', '{}'::jsonb, TRUE)
         ON CONFLICT (nome) DO NOTHING`,
      );
      await queryRunner.query(
        `UPDATE ${table('usuarios')} AS usuario
         SET perfil_id = perfil.id, updated_at = now()
         FROM ${table('perfis')} AS perfil
         WHERE perfil.nome = 'OPERADOR'
           AND lower(trim(usuario.usuario)) = ANY($1::varchar[])
           AND usuario.perfil_id = (
             SELECT id FROM ${table('perfis')} WHERE nome = $2
           )`,
        [Array.from(USUARIOS_ADMIN_AUTOMACAO), PERFIL_ADMIN_AUTOMACAO],
      );
      await queryRunner.query(
        `DELETE FROM ${table('perfis')} AS perfil
         WHERE perfil.nome = $1
           AND NOT EXISTS (
             SELECT 1 FROM ${table('usuarios')} AS usuario WHERE usuario.perfil_id = perfil.id
           )`,
        [PERFIL_ADMIN_AUTOMACAO],
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }
}
