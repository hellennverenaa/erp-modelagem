import { EntityManager, In } from 'typeorm';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Peca } from '../entities/Peca';
import { RotaModelo } from '../entities/RotaModelo';
import { Setor } from '../entities/Setor';
import { Planta } from '../entities/Planta';

export interface RotaEtapaInput {
  setorId: string;
  ordem: number;
}

export interface PecaCorteInput {
  setorCorteOpcaoId: string;
}

const REQUIRED_TYPES = [
  'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'TELAS', 'CORTE_RECEBIMENTO',
  'CORTE_SEPARACAO', 'CORTE_DUBLAGEM', 'CORTE_PONTE',
  'CORTE_LECTRA', 'APOIO', 'COSTURA', 'MONTAGEM', 'LABORATORIO',
];
const CUT_TYPES = new Set([
  'CORTE_PONTE', 'CORTE_LECTRA', 'CORTE_ATOM',
  'CORTE_CN', 'CORTE_COURO', 'CORTE_LASER',
]);

export class RouteIntegrityError extends Error {
  constructor(message: string, public readonly code = 'ROUTE_INCOMPLETE') {
    super(message);
    this.name = 'RouteIntegrityError';
  }
}

/** Valida o mesmo contrato para Construtor, wizard e criação individual da ordem. */
export async function validateRouteIntegrity(
  manager: EntityManager,
  rota: RotaEtapaInput[],
  pecas: PecaCorteInput[],
  plantaId?: string,
): Promise<void> {
  if (rota.length === 0 || pecas.length === 0) {
    throw new RouteIntegrityError('Cadastre peças e construa a rota antes de criar a ordem.');
  }

  const opcaoIds = [...new Set(pecas.map((peca) => peca.setorCorteOpcaoId))];
  if (opcaoIds.some((id) => !id)) {
    throw new RouteIntegrityError('Todas as peças precisam de um sub-setor de corte.');
  }
  const opcoes = await manager.getRepository(ConfigOpcao).find({
    where: { id: In(opcaoIds), ativo: true },
    relations: { categoria: true },
  });
  if (opcoes.length !== opcaoIds.length || opcoes.some((opcao) => opcao.categoria.slug !== 'subsetor_corte' || !opcao.categoria.ativo)) {
    throw new RouteIntegrityError('Uma ou mais peças usam um sub-setor de corte inválido.');
  }
  if (plantaId) {
    const planta = await manager.getRepository(Planta).findOne({ where: { id: plantaId, ativo: true }, select: { id: true } });
    if (!planta) throw new RouteIntegrityError('A planta da rota não existe ou está inativa.', 'ROUTE_PLANT_MISMATCH');
  }
  const tipoPorOpcao = new Map(opcoes.map((opcao) => [opcao.id, `CORTE_${opcao.valor.trim().toUpperCase()}`]));
  const tiposDasPecas = new Set(pecas.map((peca) => tipoPorOpcao.get(peca.setorCorteOpcaoId)!));
  if (!tiposDasPecas.has('CORTE_LECTRA') || !tiposDasPecas.has('CORTE_PONTE')) {
    throw new RouteIntegrityError('Cadastre ao menos uma peça em Lectra e uma em Ponte.');
  }
  if ([...tiposDasPecas].some((tipo) => !CUT_TYPES.has(tipo))) {
    throw new RouteIntegrityError('Há peças vinculadas a um sub-setor de corte não suportado.');
  }

  const setorIds = [...new Set(rota.map((etapa) => etapa.setorId))];
  const setores = await manager.getRepository(Setor).find({ where: { id: In(setorIds), ativo: true } });
  if (setores.length !== setorIds.length) {
    throw new RouteIntegrityError('A rota contém setores inexistentes ou inativos.');
  }
  const plantas = new Set(setores.map((setor) => setor.plantaId));
  if (plantas.size !== 1 || (plantaId && !plantas.has(plantaId))) {
    throw new RouteIntegrityError('Todos os setores da rota devem pertencer à planta da ordem.', 'ROUTE_PLANT_MISMATCH');
  }
  const tipos = await manager.getRepository(ConfigOpcao).find({
    where: { id: In([...new Set(setores.map((setor) => setor.tipoOpcaoId))]) },
  });
  const tipoPorId = new Map(tipos.map((tipo) => [tipo.id, tipo.valor]));
  const tiposDaRota = new Set(setores.map((setor) => tipoPorId.get(setor.tipoOpcaoId)));
  const faltantes = REQUIRED_TYPES.filter((tipo) => !tiposDaRota.has(tipo));
  if (faltantes.length > 0) {
    throw new RouteIntegrityError(`A rota está incompleta. Setores ausentes: ${faltantes.join(', ')}.`);
  }
  for (const tipo of CUT_TYPES) {
    if (tiposDaRota.has(tipo) !== tiposDasPecas.has(tipo)) {
      throw new RouteIntegrityError(`O sub-setor ${tipo} deve constar na rota somente quando tiver peças vinculadas.`);
    }
  }
}

export async function validatePersistedModelRoute(
  manager: EntityManager,
  modeloId: string,
  plantaId?: string,
): Promise<void> {
  const [rota, pecas] = await Promise.all([
    manager.getRepository(RotaModelo).find({ where: plantaId ? { modeloId, plantaId } : { modeloId } }),
    manager.getRepository(Peca).find({ where: { modeloId } }),
  ]);
  await validateRouteIntegrity(manager, rota, pecas, plantaId);
}
