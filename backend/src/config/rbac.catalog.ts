export interface RbacScreenDefinition {
  routeName: string;
  routePath: string;
  label: string;
  viewPermission: string;
  editPermission?: string;
}

export const RBAC_SCREENS: RbacScreenDefinition[] = [
  { routeName: 'gerencial', routePath: '/dashboard/gerencial', label: 'Torre de Controle', viewPermission: 'TELA_TORRE_CONTROLE' },
  { routeName: 'modelos', routePath: '/dashboard/modelos', label: 'Catálogo de Modelos', viewPermission: 'TELA_CATALOGO_MODELOS', editPermission: 'EDITAR_TELA_CATALOGO_MODELOS' },
  { routeName: 'catalogo-pecas', routePath: '/dashboard/catalogo-pecas', label: 'Catálogo de Peças', viewPermission: 'TELA_CATALOGO_PECAS', editPermission: 'EDITAR_TELA_CATALOGO_PECAS' },
  { routeName: 'ordens', routePath: '/dashboard/ordens', label: 'Gestão de Ordens', viewPermission: 'TELA_GESTAO_ORDENS', editPermission: 'EDITAR_TELA_GESTAO_ORDENS' },
  { routeName: 'rotas', routePath: '/dashboard/rotas', label: 'Construtor de Rota', viewPermission: 'TELA_CONSTRUTOR_ROTA', editPermission: 'EDITAR_TELA_CONSTRUTOR_ROTA' },
  { routeName: 'bipagem', routePath: '/dashboard/bipagem', label: 'Bipagem Operacional', viewPermission: 'TELA_BIPAGEM', editPermission: 'EDITAR_TELA_BIPAGEM' },
  { routeName: 'inspecao', routePath: '/dashboard/inspecao', label: 'Inspeção de Qualidade', viewPermission: 'TELA_INSPECAO_QUALIDADE', editPermission: 'EDITAR_TELA_INSPECAO_QUALIDADE' },
  { routeName: 'rastreamento-ordem', routePath: '/dashboard/rastreamento', label: 'Rastreamento', viewPermission: 'TELA_RASTREAMENTO' },
  { routeName: 'novo-teste', routePath: '/dashboard/novo-teste', label: 'Nova Ordem de Teste', viewPermission: 'TELA_NOVA_ORDEM_TESTE', editPermission: 'EDITAR_TELA_NOVA_ORDEM_TESTE' },
  { routeName: 'checklist', routePath: '/dashboard/checklist/:ordemTesteId/:setorId', label: 'Checklist de Setor', viewPermission: 'TELA_CHECKLIST', editPermission: 'EDITAR_TELA_CHECKLIST' },
];

export const RBAC_GLOBAL_ACTIONS: Array<{ acao: string; label: string }> = [
  { acao: 'EDITAR_ROTA', label: 'Editar rota de produção' },
  { acao: 'ACESSAR_TODOS_SETORES', label: 'Acessar checklists de todos os setores' },
  { acao: 'ACESSAR_TODAS_PLANTAS', label: 'Acessar dados de todas as plantas' },
  { acao: 'ADICIONAR_ITEM_AVULSO_CHECKLIST', label: 'Adicionar item avulso ao checklist' },
  { acao: 'ADMINISTRAR_BIPAGEM', label: 'Administrar dados operacionais da bipagem' },
  { acao: 'ADMINISTRAR_CONFIGURACOES', label: 'Administrar configurações do sistema' },
];

export const RBAC_SECTOR_ACTIONS: Array<{ acao: string; label: string }> = [
  { acao: 'BIPAR_ENTRADA', label: 'Bipar entrada' },
  { acao: 'BIPAR_SAIDA', label: 'Bipar saída' },
  { acao: 'PREENCHER_CHECKLIST', label: 'Preencher checklist' },
  { acao: 'INSPECIONAR_SETOR', label: 'Inspecionar setor' },
];

export const RBAC_PERMISSION_KEYS = new Set([
  ...RBAC_SCREENS.flatMap((screen) => [screen.viewPermission, screen.editPermission].filter(Boolean) as string[]),
  ...RBAC_GLOBAL_ACTIONS.map((action) => action.acao),
  ...RBAC_SECTOR_ACTIONS.map((action) => action.acao),
]);

export function getRbacCatalog() {
  return {
    screens: RBAC_SCREENS,
    globalActions: RBAC_GLOBAL_ACTIONS,
    sectorActions: RBAC_SECTOR_ACTIONS,
  };
}
