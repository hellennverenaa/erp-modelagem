import { EntityManager } from 'typeorm';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Peca } from '../entities/Peca';

export function getSetorCorteOpcaoEfetiva(
  ordem: Pick<OrdemTeste, 'pecasRemanejadas'>,
  peca: Pick<Peca, 'id' | 'setorCorteOpcaoId'>,
): string {
  return ordem.pecasRemanejadas?.[peca.id] || peca.setorCorteOpcaoId;
}

/** Resolve a opção de subsetor escolhida para o tipo de setor da planta. */
export async function mapearSubsetoresParaTiposDeSetor(
  manager: EntityManager,
  subsetorOpcaoIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(subsetorOpcaoIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const opcoes = await manager.getRepository(ConfigOpcao).createQueryBuilder('opcao')
    .innerJoinAndSelect('opcao.categoria', 'categoria')
    .where('opcao.id IN (:...ids)', { ids })
    .andWhere('opcao.ativo = TRUE')
    .andWhere('categoria.slug = :slug', { slug: 'subsetor_corte' })
    .andWhere('categoria.ativo = TRUE')
    .getMany();

  const valorPorSubsetor = new Map(opcoes.map((opcao) => [
    opcao.id,
    `CORTE_${opcao.valor.trim().toUpperCase().replace(/^CORTE_/, '')}`,
  ]));
  const valoresTipoSetor = [...new Set(valorPorSubsetor.values())];
  if (valoresTipoSetor.length === 0) return new Map();

  const tiposSetor = await manager.getRepository(ConfigOpcao).createQueryBuilder('opcao')
    .innerJoin('opcao.categoria', 'categoria')
    .where('opcao.valor IN (:...valores)', { valores: valoresTipoSetor })
    .andWhere('opcao.ativo = TRUE')
    .andWhere('categoria.slug = :slug', { slug: 'setor_tipo' })
    .andWhere('categoria.ativo = TRUE')
    .getMany();
  const idPorValor = new Map(tiposSetor.map((tipo) => [tipo.valor, tipo.id]));

  const resultado = new Map<string, string>();
  for (const [subsetorId, tipoValor] of valorPorSubsetor) {
    const tipoId = idPorValor.get(tipoValor);
    if (tipoId) resultado.set(subsetorId, tipoId);
  }
  return resultado;
}

export function getSetorCorteOpcaoIdsDaOrdem(ordem: Pick<OrdemTeste, 'pecasRemanejadas'>, pecas: Peca[]): string[] {
  return [...new Set(pecas.map((peca) => getSetorCorteOpcaoEfetiva(ordem, peca)).filter(Boolean))];
}

export async function getTipoSetorIdsCorteDaOrdem(
  manager: EntityManager,
  ordem: Pick<OrdemTeste, 'pecasRemanejadas'>,
  pecas: Peca[],
): Promise<string[]> {
  const idsPorSubsetor = await mapearSubsetoresParaTiposDeSetor(
    manager,
    getSetorCorteOpcaoIdsDaOrdem(ordem, pecas),
  );
  return [...new Set(idsPorSubsetor.values())];
}
