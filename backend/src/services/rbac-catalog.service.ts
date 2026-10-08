import { AppDataSource } from '../config/database';
import { RbacCatalogItem } from '../entities/RbacCatalogItem';
import { RbacScreenDefinition } from '../config/rbac.catalog';

export async function carregarCatalogoRbac() {
  const rows = await AppDataSource.getRepository(RbacCatalogItem).find({
    where: { ativo: true },
    order: { tipo: 'ASC', ordem: 'ASC' },
  });
  return {
    screens: rows.filter((row) => row.tipo === 'tela').map((row) => row.definicao as unknown as RbacScreenDefinition),
    globalActions: rows.filter((row) => row.tipo === 'acao_global').map((row) => row.definicao as { acao: string; label: string }),
    sectorActions: rows.filter((row) => row.tipo === 'acao_setor').map((row) => row.definicao as { acao: string; label: string }),
  };
}
