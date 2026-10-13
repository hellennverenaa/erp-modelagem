import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { CatalogoPeca } from '../entities/CatalogoPeca';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Marca } from '../entities/Marca';
import { Modelo } from '../entities/Modelo';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { Peca } from '../entities/Peca';
import { Planta } from '../entities/Planta';
import { RotaModelo } from '../entities/RotaModelo';
import { Setor } from '../entities/Setor';
import { FinalizarNovoTesteInput } from '../schemas/novo-teste.schema';

export class NovoTesteServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NovoTesteServiceError';
  }
}

export async function finalizarNovoTeste(input: FinalizarNovoTesteInput, usuarioId: string) {
  return AppDataSource.transaction(async (manager) => {
    const marca = await manager.getRepository(Marca).findOne({
      where: { id: input.modelo.marcaId, ativo: true },
    });
    if (!marca) {
      throw new NovoTesteServiceError('Marca não encontrada ou inativa.', 404, 'MARCA_NOT_FOUND');
    }

    const modeloExistente = await manager.getRepository(Modelo).findOne({
      where: { codigoProduto: input.modelo.codigoProduto },
      select: { id: true },
    });
    if (modeloExistente) {
      throw new NovoTesteServiceError(
        'Já existe um modelo com este código de produto.',
        409,
        'MODELO_DUPLICATE_CODE',
      );
    }

    const planta = await manager.getRepository(Planta).findOne({
      where: { id: input.ordem.plantaId, ativo: true },
      select: { id: true },
    });
    if (!planta) {
      throw new NovoTesteServiceError('Planta não encontrada ou inativa.', 404, 'PLANTA_NOT_FOUND');
    }

    const catalogoIds = input.pecas.map((peca) => peca.catalogoPecaId);
    const catalogoPecas = await manager.getRepository(CatalogoPeca).find({
      where: { id: In(catalogoIds), ativo: true },
    });
    if (catalogoPecas.length !== catalogoIds.length) {
      throw new NovoTesteServiceError(
        'Uma ou mais peças do catálogo não existem ou estão inativas.',
        400,
        'CATALOG_PIECES_INVALID',
      );
    }

    const opcaoIds = [...new Set(input.pecas.map((peca) => peca.setorCorteOpcaoId))];
    const opcoesCorte = await manager.getRepository(ConfigOpcao)
      .createQueryBuilder('opcao')
      .innerJoin('opcao.categoria', 'categoria')
      .where('opcao.id IN (:...opcaoIds)', { opcaoIds })
      .andWhere('opcao.ativo = TRUE')
      .andWhere('categoria.slug = :slug', { slug: 'subsetor_corte' })
      .andWhere('categoria.ativo = TRUE')
      .getMany();
    if (opcoesCorte.length !== opcaoIds.length) {
      throw new NovoTesteServiceError(
        'Selecione opções de corte ativas e pertencentes ao catálogo de subsetores de corte.',
        400,
        'CUT_OPTIONS_INVALID',
      );
    }

    const setorIds = [...new Set(input.rota.map((etapa) => etapa.setorId))];
    const setores = await manager.getRepository(Setor).find({
      where: { id: In(setorIds), ativo: true },
      select: { id: true },
    });
    if (setores.length !== setorIds.length) {
      throw new NovoTesteServiceError(
        'Um ou mais setores da rota não existem ou estão inativos.',
        400,
        'ROUTE_SECTORS_INVALID',
      );
    }

    const modeloRepo = manager.getRepository(Modelo);
    const modelo = await modeloRepo.save(modeloRepo.create({
      marcaId: input.modelo.marcaId,
      codigoProduto: input.modelo.codigoProduto,
      nome: input.modelo.nome,
      temporada: null,
      dataCorte: null,
      mfmReferenciaUrl: null,
      fichaTecnicaUrl: null,
      ativo: true,
    }));

    const catalogoPorId = new Map(catalogoPecas.map((peca) => [peca.id, peca]));
    const pecasRepo = manager.getRepository(Peca);
    const pecas = input.pecas.map((item) => {
      const itemCatalogo = catalogoPorId.get(item.catalogoPecaId)!;
      if (itemCatalogo.nome.length > 150) {
        throw new NovoTesteServiceError(
          `O nome da peça ${itemCatalogo.numero} excede o limite de 150 caracteres.`,
          400,
          'CATALOG_PIECE_NAME_TOO_LONG',
        );
      }
      return pecasRepo.create({
        modeloId: modelo.id,
        nome: itemCatalogo.nome,
        setorCorteOpcaoId: item.setorCorteOpcaoId,
        descricao: itemCatalogo.descricao,
      });
    });
    await pecasRepo.save(pecas);

    const rotaRepo = manager.getRepository(RotaModelo);
    const rota = input.rota.map((etapa) => rotaRepo.create({
      modeloId: modelo.id,
      setorId: etapa.setorId,
      ordem: etapa.ordem,
      obrigatorio: etapa.obrigatorio,
      tipoExecucao: etapa.tipoExecucao,
      bipagemApenasSaida: etapa.bipagemApenasSaida,
    }));
    await rotaRepo.save(rota);

    const ordemRepo = manager.getRepository(OrdemTeste);
    const ordem = await ordemRepo.save(ordemRepo.create({
      modeloId: modelo.id,
      plantaId: input.ordem.plantaId,
      criadoPorId: usuarioId,
      codigoBarras: `OT-${Date.now()}`,
      dataInicio: new Date(),
      prioridadePcp: input.ordem.prioridadePcp,
      status: OrdemTesteStatus.AGUARDANDO_MATERIAL,
      liberadoProducao: false,
      possuiCaixaTeste: input.ordem.possuiCaixaTeste,
      observacoes: input.ordem.observacoes || null,
      dataPrevistaProducao: input.ordem.dataPrevistaProducao
        ? new Date(input.ordem.dataPrevistaProducao)
        : null,
      slasPorSetor: input.ordem.slasPorSetor || null,
    }));

    return { modelo, ordem, totalPecas: pecas.length, totalEtapasRota: rota.length };
  });
}
