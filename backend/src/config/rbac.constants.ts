export const PERFIL_ADMIN_AUTOMACAO = 'ADMIN_AUTOMACAO';

/** Contas autorizadas a receber o perfil de administração do RBAC. */
export const USUARIOS_ADMIN_AUTOMACAO = new Set([
  'hellen.magalhaes',
  'jose.falcao',
  'leone.santana',
]);

export function ehUsuarioAdminAutomacao(usuario?: string | null): boolean {
  return USUARIOS_ADMIN_AUTOMACAO.has(String(usuario || '').trim().toLowerCase());
}
