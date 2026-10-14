import { EntityManager, In } from 'typeorm';
import { CatalogoPeca } from '../entities/CatalogoPeca';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Peca } from '../entities/Peca';

export interface ModelPieceInput {
  id?: string;
  catalogoPecaId: string;
  setorCorteOpcaoId: string;
}

export class ModelPiecesError extends Error {
  constructor(message: string, public readonly code = 'MODEL_PIECES_INVALID') {
    super(message);
    this.name = 'ModelPiecesError';
  }
}

export async function validateModelPieces(manager: EntityManager, pecas: ModelPieceInput[]) {
  const catalogoIds = pecas.map((peca) => peca.catalogoPecaId);
  if (pecas.length < 2 || new Set(catalogoIds).size !== catalogoIds.length) {
    throw new ModelPiecesError('Informe peças distintas para o modelo.');
  }
  const opcoesIds = [...new Set(pecas.map((peca) => peca.setorCorteOpcaoId))];
  const [catalogo, opcoes] = await Promise.all([
    manager.getRepository(CatalogoPeca).find({ where: { id: In(catalogoIds), ativo: true } }),
    manager.getRepository(ConfigOpcao).find({ where: { id: In(opcoesIds), ativo: true }, relations: { categoria: true } }),
  ]);
  if (catalogo.length !== catalogoIds.length) {
    throw new ModelPiecesError('Uma ou mais peças não existem no catálogo ativo.');
  }
  if (opcoes.length !== opcoesIds.length || opcoes.some((opcao) => opcao.categoria.slug !== 'subsetor_corte' || !opcao.categoria.ativo)) {
    throw new ModelPiecesError('Uma ou mais opções de corte não são válidas.');
  }
  const valores = new Set(opcoes.map((opcao) => opcao.valor.trim().toUpperCase()));
  if (!valores.has('LECTRA') || !valores.has('PONTE')) {
    throw new ModelPiecesError('O modelo precisa ter ao menos uma peça para Lectra e uma para Ponte.');
  }
  return new Map(catalogo.map((item) => [item.id, item]));
}

/** Mantém os IDs das peças existentes, que podem ser citados em rastreamentos. */
export async function saveModelPieces(manager: EntityManager, modeloId: string, pecas: ModelPieceInput[]) {
  const catalogo = await validateModelPieces(manager, pecas);
  const repo = manager.getRepository(Peca);
  const existentes = await repo.find({ where: { modeloId } });
  const idsExistentes = new Set(existentes.map((peca) => peca.id));
  const idsPecasRecebidos = pecas.map((peca) => peca.id).filter((id): id is string => Boolean(id));
  const idsRecebidos = new Set(idsPecasRecebidos);
  if (idsRecebidos.size !== idsPecasRecebidos.length) {
    throw new ModelPiecesError('Uma peça do modelo foi enviada mais de uma vez.');
  }
  if (existentes.some((peca) => !idsRecebidos.has(peca.id)) ||
      pecas.some((peca) => peca.id && !idsExistentes.has(peca.id))) {
    throw new ModelPiecesError('A edição deve preservar todas as peças atuais do modelo.');
  }
  const porId = new Map(existentes.map((peca) => [peca.id, peca]));
  const atualizadas = pecas.map((item) => {
    const catalogoPeca = catalogo.get(item.catalogoPecaId)!;
    if (catalogoPeca.nome.length > 150) {
      throw new ModelPiecesError(`O nome da peça ${catalogoPeca.numero} excede 150 caracteres.`);
    }
    const peca = item.id ? porId.get(item.id)! : repo.create({ modeloId });
    peca.catalogoPecaId = catalogoPeca.id;
    peca.nome = catalogoPeca.nome;
    peca.descricao = catalogoPeca.descricao;
    peca.setorCorteOpcaoId = item.setorCorteOpcaoId;
    return peca;
  });
  return repo.save(atualizadas);
}
