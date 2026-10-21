import { Request, Response } from 'express';
import { In, SelectQueryBuilder } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { OcorrenciaProducao, StatusOcorrencia } from '../entities/OcorrenciaProducao';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { Retrabalho } from '../entities/Retrabalho';
import { Anexo } from '../entities/Anexo';
import { Planta } from '../entities/Planta';
import { Setor } from '../entities/Setor';
import { perfilPossuiPermissao } from '../services/rbac.service';

const dataFiltroSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data deve usar o formato AAAA-MM-DD.')
  .refine((value) => {
    const data = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === value;
  }, 'A data informada não existe.');

const filtrosDashboardSchema = z.object({
  plantaId: z.string().uuid().optional(),
  setorId: z.string().uuid().optional(),
  dataInicio: dataFiltroSchema.optional(),
  dataFim: dataFiltroSchema.optional(),
}).superRefine((filtros, ctx) => {
  if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A data inicial não pode ser posterior à data final.',
      path: ['dataFim'],
    });
  }
});

type FiltrosDashboard = z.infer<typeof filtrosDashboardSchema>;

interface EscopoPlantas {
  acessoTodasPlantas: boolean;
  plantaId: string | null;
}

class DashboardRequestError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Retorna 0 se o valor for null/undefined/NaN */
function safeNum(val: number | null | undefined, decimals = 2): number {
  if (val == null || isNaN(val as number)) return 0;
  return Number((val as number).toFixed(decimals));
}

function proximoDia(data: string): string {
  const valor = new Date(`${data}T00:00:00.000Z`);
  valor.setUTCDate(valor.getUTCDate() + 1);
  return valor.toISOString().slice(0, 10);
}

function aplicarFiltroPeriodo(
  queryBuilder: SelectQueryBuilder<any>,
  colunaData: string,
  filtros: Pick<FiltrosDashboard, 'dataInicio' | 'dataFim'>,
): void {
  if (filtros.dataInicio) {
    queryBuilder.andWhere(`${colunaData} >= :dataInicio`, { dataInicio: filtros.dataInicio });
  }
  if (filtros.dataFim) {
    queryBuilder.andWhere(`${colunaData} < :dataFimExclusiva`, {
      dataFimExclusiva: proximoDia(filtros.dataFim),
    });
  }
}

export class DashboardController {
  private async resolverEscopoPlantas(req: Request, plantaIdSolicitada?: string): Promise<EscopoPlantas> {
    if (!req.user) {
      throw new DashboardRequestError(401, 'AUTH_UNAUTHENTICATED', 'Usuário não autenticado.');
    }

    const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
    if (acessoTodasPlantas) {
      if (plantaIdSolicitada) {
        const planta = await AppDataSource.getRepository(Planta).findOneBy({ id: plantaIdSolicitada });
        if (!planta) {
          throw new DashboardRequestError(400, 'PLANTA_INVALIDA', 'A planta informada não foi encontrada.');
        }
      }
      return { acessoTodasPlantas: true, plantaId: plantaIdSolicitada ?? null };
    }

    if (!req.user.plantaId) {
      throw new DashboardRequestError(403, 'PLANTA_NAO_CONFIGURADA', 'O usuário não possui uma planta de lotação configurada.');
    }
    if (plantaIdSolicitada && plantaIdSolicitada !== req.user.plantaId) {
      throw new DashboardRequestError(403, 'PLANTA_FORA_DO_ESCOPO', 'O usuário não tem acesso à planta informada.');
    }

    return { acessoTodasPlantas: false, plantaId: req.user.plantaId };
  }

  private async validarSetorNoEscopo(setorId: string | undefined, escopo: EscopoPlantas): Promise<void> {
    if (!setorId) return;

    const query = AppDataSource.getRepository(Setor)
      .createQueryBuilder('setor')
      .where('setor.id = :setorId', { setorId });

    if (escopo.plantaId) {
      query.andWhere('setor.plantaId = :plantaId', { plantaId: escopo.plantaId });
    }

    if (!await query.getOne()) {
      throw new DashboardRequestError(400, 'SETOR_FORA_DO_ESCOPO', 'O setor informado não está disponível para a planta selecionada.');
    }
  }

  public getFilters = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parseResult = z.object({ plantaId: z.string().uuid().optional() }).safeParse(req.query);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Filtros inválidos.', code: 'DASHBOARD_FILTERS_INVALID' });
      }

      const escopo = await this.resolverEscopoPlantas(req, parseResult.data.plantaId);
      const plantaRepo = AppDataSource.getRepository(Planta);
      const plantas = escopo.plantaId
        ? await plantaRepo.find({ where: { id: escopo.plantaId }, order: { nome: 'ASC' } })
        : await plantaRepo.find({ order: { nome: 'ASC' } });
      const plantaIds = plantas.map((planta) => planta.id);
      const setores = plantaIds.length > 0
        ? await AppDataSource.getRepository(Setor).find({
            where: { plantaId: In(plantaIds) },
            relations: { planta: true },
            order: { nome: 'ASC' },
          })
        : [];

      return res.json({
        acessoTodasPlantas: escopo.acessoTodasPlantas,
        plantaId: escopo.plantaId,
        plantas: plantas.map((planta) => ({
          id: planta.id,
          nome: planta.nome,
          ativo: planta.ativo,
        })),
        setores: setores.map((setor) => ({
          id: setor.id,
          nome: setor.nome,
          plantaId: setor.plantaId,
          planta: setor.planta?.nome ?? 'Planta não informada',
          ativo: setor.ativo,
        })),
      });
    } catch (error: any) {
      if (error instanceof DashboardRequestError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[DashboardController] Erro ao carregar filtros:', error);
      return res.status(500).json({ error: 'Erro ao carregar filtros do Dashboard' });
    }
  };

  public getKpis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parseResult = filtrosDashboardSchema.safeParse(req.query);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Filtros inválidos.',
          code: 'DASHBOARD_FILTERS_INVALID',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const filtros = parseResult.data;
      const escopo = await this.resolverEscopoPlantas(req, filtros.plantaId);
      await this.validarSetorNoEscopo(filtros.setorId, escopo);
      const agora = new Date();

      // ==========================================
      // KPI A: LEAD TIME + ORDENS EM ANDAMENTO
      // ==========================================
      const queryOrdens = AppDataSource
        .getRepository(OrdemTeste)
        .createQueryBuilder('ordem')
        .leftJoinAndSelect('ordem.rastreamentos', 'rastreamento')
        .leftJoinAndSelect('ordem.modelo', 'modelo')
        .leftJoinAndSelect('modelo.marca', 'marca')
        .where('ordem.status IN (:...statuses)', {
          statuses: Object.values(OrdemTesteStatus).filter(
            (status) => status !== OrdemTesteStatus.REPROVADO,
          ),
        })
        .orderBy('ordem.dataInicio', 'DESC');

      if (escopo.plantaId) {
        queryOrdens.andWhere('ordem.plantaId = :plantaId', { plantaId: escopo.plantaId });
      }
      aplicarFiltroPeriodo(queryOrdens, 'ordem.dataInicio', filtros);

      const ordensCarregadas = await queryOrdens.getMany();
      const ordensAtivas = filtros.setorId
        ? ordensCarregadas.filter((ordem) => {
            if (ordem.rotaSnapshot) {
              return Array.isArray(ordem.rotaSnapshot.etapas) &&
                ordem.rotaSnapshot.etapas.some((etapa) => etapa.setorId === filtros.setorId);
            }
            return (ordem.rastreamentos ?? []).some((rastreamento) => rastreamento.setorId === filtros.setorId);
          })
        : ordensCarregadas;
      const leadTimeResultados: {
        modeloId: string;
        codigoBarras: string;
        tipoLote: string;
        leadTimeHoras: number;
        modelo: string;
        marca: string;
        dataInicio: Date;
      }[] = [];

      for (const ordem of ordensAtivas) {
        const rastreamentos = ordem.rastreamentos ?? [];

        // Uma ordem sem bipagens conta no WIP, mas ainda não tem tipo de lote
        // confirmado para compor os indicadores de Lead Time por lote.
        if (rastreamentos.length === 0) continue;

        const byLote: Record<string, typeof rastreamentos> = {
          CAIXA_TESTE: [],
          LOTE_PRINCIPAL: [],
        };

        for (const rastreamento of rastreamentos) {
          if (rastreamento.tipoLote === 'CAIXA_TESTE') byLote.CAIXA_TESTE.push(rastreamento);
          else byLote.LOTE_PRINCIPAL.push(rastreamento);
        }

        for (const [tipo, trackings] of Object.entries(byLote)) {
          if (trackings.length === 0) continue;

          let totalMinAbsoluto = 0;
          for (const rastreamento of trackings) {
            if (rastreamento.dataSaida) {
              totalMinAbsoluto += rastreamento.tempoPermanenciaMin ?? 0;
            } else {
              const entrada = rastreamento.dataEntrada ?? rastreamento.createdAt;
              totalMinAbsoluto += Math.max(0, Math.floor((agora.getTime() - entrada.getTime()) / 60000));
            }
          }

          leadTimeResultados.push({
            modeloId: ordem.modelo?.id ?? ordem.modeloId ?? ordem.codigoBarras,
            codigoBarras: ordem.codigoBarras,
            tipoLote: tipo,
            leadTimeHoras: safeNum(totalMinAbsoluto / 60),
            modelo: ordem.modelo?.nome ?? 'N/A',
            marca: ordem.modelo?.marca?.nome ?? 'N/A',
            dataInicio: ordem.dataInicio,
          });
        }
      }

      leadTimeResultados.sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime());

      const lotePrincipalMaisRecentePorModelo = new Map<string, (typeof leadTimeResultados)[number]>();
      for (const resultado of leadTimeResultados) {
        if (resultado.tipoLote !== 'LOTE_PRINCIPAL') continue;
        const atual = lotePrincipalMaisRecentePorModelo.get(resultado.modeloId);
        if (!atual || resultado.dataInicio.getTime() > atual.dataInicio.getTime()) {
          lotePrincipalMaisRecentePorModelo.set(resultado.modeloId, resultado);
        }
      }

      const graficoPorModelo = Array.from(lotePrincipalMaisRecentePorModelo.values())
        .sort((a, b) => b.leadTimeHoras - a.leadTimeHoras || b.dataInicio.getTime() - a.dataInicio.getTime())
        .slice(0, 10)
        .map(({ codigoBarras, tipoLote, leadTimeHoras, modelo, marca, dataInicio }) => ({
          codigoBarras,
          tipoLote,
          leadTimeHoras,
          modelo,
          marca,
          dataInicio,
        }));

      const ctList = leadTimeResultados.filter((resultado) => resultado.tipoLote === 'CAIXA_TESTE');
      const lpList = leadTimeResultados.filter((resultado) => resultado.tipoLote === 'LOTE_PRINCIPAL');
      const avgCT = ctList.length > 0
        ? ctList.slice(0, 5).reduce((soma, item) => soma + item.leadTimeHoras, 0) / Math.min(5, ctList.length)
        : 0;
      const avgLP = lpList.length > 0
        ? lpList.slice(0, 5).reduce((soma, item) => soma + item.leadTimeHoras, 0) / Math.min(5, lpList.length)
        : 0;

      const kpiA = {
        totalOrdensAtivas: ordensAtivas.length,
        mediaCaixaTeste: safeNum(avgCT),
        mediaLotePrincipal: safeNum(avgLP),
        grafico: graficoPorModelo,
      };

      // ==========================================
      // KPI B: OCORRÊNCIAS ABERTAS
      // ==========================================
      const queryOcorrencias = AppDataSource
        .getRepository(OcorrenciaProducao)
        .createQueryBuilder('oc')
        .leftJoinAndSelect('oc.setor', 'setor')
        .leftJoinAndSelect('setor.planta', 'plantaSetor')
        .leftJoinAndSelect('oc.reportadoPor', 'reporter')
        .leftJoinAndSelect('oc.ordemTeste', 'ordem')
        .leftJoinAndSelect('ordem.planta', 'plantaOrdem')
        .where('oc.status IN (:...statuses)', {
          statuses: [StatusOcorrencia.ABERTA, StatusOcorrencia.EM_ANALISE],
        })
        .orderBy('oc.dataOcorrencia', 'DESC');

      if (escopo.plantaId) queryOcorrencias.andWhere('ordem.plantaId = :plantaId', { plantaId: escopo.plantaId });
      if (filtros.setorId) queryOcorrencias.andWhere('oc.setorId = :setorId', { setorId: filtros.setorId });
      aplicarFiltroPeriodo(queryOcorrencias, 'oc.dataOcorrencia', filtros);

      const ocorrencias = await queryOcorrencias.getMany();
      const gravityOrder: Record<string, number> = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAIXA: 4 };
      ocorrencias.sort((a, b) => {
        const diff = (gravityOrder[a.gravidade] ?? 99) - (gravityOrder[b.gravidade] ?? 99);
        return diff !== 0 ? diff : b.dataOcorrencia.getTime() - a.dataOcorrencia.getTime();
      });

      const occurrenceIds = ocorrencias.map((ocorrencia) => ocorrencia.id);
      const anexos = occurrenceIds.length > 0
        ? await AppDataSource.getRepository(Anexo).find({
            where: { entidadeTipo: 'ocorrencias_producao', entidadeId: In(occurrenceIds) },
          })
        : [];

      const kpiB = ocorrencias.map((ocorrencia) => {
        const anexosOcorrencia = anexos.filter((anexo) => anexo.entidadeId === ocorrencia.id);
        return {
          id: ocorrencia.id,
          titulo: ocorrencia.titulo ?? '',
          descricao: ocorrencia.descricao ?? '',
          tipoOcorrencia: ocorrencia.tipoOcorrencia,
          gravidade: ocorrencia.gravidade,
          status: ocorrencia.status,
          dataOcorrencia: ocorrencia.dataOcorrencia,
          setorId: ocorrencia.setorId,
          setor: ocorrencia.setor?.nome ?? 'N/A',
          plantaId: ocorrencia.ordemTeste?.plantaId ?? ocorrencia.setor?.plantaId ?? null,
          planta: ocorrencia.ordemTeste?.planta?.nome ?? ocorrencia.setor?.planta?.nome ?? 'N/A',
          reportadoPor: ocorrencia.reportadoPor?.nomeCompleto ?? 'N/A',
          totalFotos: anexosOcorrencia.length,
          fotos: anexosOcorrencia.map((anexo) => anexo.caminhoArquivo),
        };
      });

      // ==========================================
      // KPI C: INSPEÇÕES DE SAÍDA / FPY
      // ==========================================
      const queryInspecoes = AppDataSource
        .getRepository(Inspecao)
        .createQueryBuilder('insp')
        .leftJoinAndSelect('insp.setor', 'setor')
        .leftJoinAndSelect('setor.planta', 'plantaSetor')
        .leftJoinAndSelect('insp.ordemTeste', 'ordem')
        .leftJoinAndSelect('ordem.planta', 'plantaOrdem')
        .where('insp.tipoInspecao = :tipo', { tipo: TipoInspecao.SAIDA_SETOR });

      if (escopo.plantaId) queryInspecoes.andWhere('ordem.plantaId = :plantaId', { plantaId: escopo.plantaId });
      if (filtros.setorId) queryInspecoes.andWhere('insp.setorId = :setorId', { setorId: filtros.setorId });
      aplicarFiltroPeriodo(queryInspecoes, 'insp.dataInspecao', filtros);

      const inspecoes = await queryInspecoes.getMany();
      const fpyPorSetor: Record<string, {
        setorId: string;
        setor: string;
        plantaId: string;
        planta: string;
        total: number;
        aprovadas: number;
      }> = {};
      let totalInspGlobal = 0;
      let aprovadasGlobal = 0;

      for (const inspecao of inspecoes) {
        const setorId = inspecao.setorId;
        const plantaId = inspecao.ordemTeste?.plantaId ?? inspecao.setor?.plantaId ?? 'PLANTA_DESCONHECIDA';
        const chave = `${plantaId}:${setorId}`;
        if (!fpyPorSetor[chave]) {
          fpyPorSetor[chave] = {
            setorId,
            setor: inspecao.setor?.nome ?? 'SETOR DESCONHECIDO',
            plantaId,
            planta: inspecao.ordemTeste?.planta?.nome ?? inspecao.setor?.planta?.nome ?? 'Planta não informada',
            total: 0,
            aprovadas: 0,
          };
        }
        fpyPorSetor[chave].total += 1;
        totalInspGlobal += 1;

        // Mantém a regra atual: APROVADO_CONCESSAO também entra como aprovada.
        if (
          inspecao.resultado === ResultadoInspecao.APROVADO ||
          inspecao.resultado === ResultadoInspecao.APROVADO_CONCESSAO
        ) {
          fpyPorSetor[chave].aprovadas += 1;
          aprovadasGlobal += 1;
        }
      }

      const fpySetores = Object.values(fpyPorSetor).map((dados) => ({
        setorId: dados.setorId,
        setor: dados.setor,
        plantaId: dados.plantaId,
        planta: dados.planta,
        totalInspecoes: dados.total,
        aprovadasPrimeira: dados.aprovadas,
        fpyPercentual: safeNum((dados.aprovadas / dados.total) * 100),
      }));
      fpySetores.sort((a, b) => a.fpyPercentual - b.fpyPercentual);

      const kpiC = {
        fpyGlobal: totalInspGlobal > 0 ? safeNum((aprovadasGlobal / totalInspGlobal) * 100) : null,
        totalInspecoes: totalInspGlobal,
        setores: fpySetores,
      };

      // ==========================================
      // KPI D: RETRABALHOS
      // ==========================================
      const queryRetrabalhos = AppDataSource
        .getRepository(Retrabalho)
        .createQueryBuilder('rt')
        .leftJoinAndSelect('rt.setorOrigem', 'setorOrigem')
        .leftJoinAndSelect('setorOrigem.planta', 'plantaSetor')
        .leftJoinAndSelect('rt.divergencia', 'divergencia')
        .leftJoinAndSelect('rt.ordemTeste', 'ordem')
        .leftJoinAndSelect('ordem.planta', 'plantaOrdem');

      if (escopo.plantaId) queryRetrabalhos.andWhere('ordem.plantaId = :plantaId', { plantaId: escopo.plantaId });
      if (filtros.setorId) queryRetrabalhos.andWhere('rt.setorOrigemId = :setorId', { setorId: filtros.setorId });
      aplicarFiltroPeriodo(queryRetrabalhos, 'COALESCE(rt.dataInicio, rt.createdAt)', filtros);

      const retrabalhos = await queryRetrabalhos.getMany();
      const retrabalhoPorSetor: Record<string, {
        setorId: string;
        setor: string;
        plantaId: string;
        planta: string;
        total: number;
        tempos: number[];
        divergencias: Set<string>;
      }> = {};
      let totalRetrabalhos = 0;

      for (const retrabalho of retrabalhos) {
        const setorId = retrabalho.setorOrigemId;
        const plantaId = retrabalho.ordemTeste?.plantaId ?? retrabalho.setorOrigem?.plantaId ?? 'PLANTA_DESCONHECIDA';
        const chave = `${plantaId}:${setorId}`;
        if (!retrabalhoPorSetor[chave]) {
          retrabalhoPorSetor[chave] = {
            setorId,
            setor: retrabalho.setorOrigem?.nome ?? 'SETOR DESCONHECIDO',
            plantaId,
            planta: retrabalho.ordemTeste?.planta?.nome ?? retrabalho.setorOrigem?.planta?.nome ?? 'Planta não informada',
            total: 0,
            tempos: [],
            divergencias: new Set(),
          };
        }

        retrabalhoPorSetor[chave].total += 1;
        totalRetrabalhos += 1;
        if (retrabalho.dataInicio && retrabalho.dataFim) {
          retrabalhoPorSetor[chave].tempos.push(
            Math.max(0, Math.floor((retrabalho.dataFim.getTime() - retrabalho.dataInicio.getTime()) / 60000)),
          );
        }
        if (retrabalho.divergencia?.tipoDivergencia) {
          retrabalhoPorSetor[chave].divergencias.add(retrabalho.divergencia.tipoDivergencia);
        }
      }

      const retrabalhoSetores = Object.values(retrabalhoPorSetor).map((dados) => ({
        setorId: dados.setorId,
        setorOrigem: dados.setor,
        plantaId: dados.plantaId,
        planta: dados.planta,
        totalRetrabalhos: dados.total,
        tempoMedioMin: dados.tempos.length > 0
          ? Math.round(dados.tempos.reduce((soma, valor) => soma + valor, 0) / dados.tempos.length)
          : null,
        tiposDivergencia: Array.from(dados.divergencias).join(', ') || 'Não especificada',
        percentualDoTotal: safeNum(totalRetrabalhos > 0 ? (dados.total / totalRetrabalhos) * 100 : 0),
      }));
      retrabalhoSetores.sort((a, b) => b.totalRetrabalhos - a.totalRetrabalhos);

      const kpiD = {
        totalRetrabalhos,
        setores: retrabalhoSetores,
      };

      return res.json({ kpiA, kpiB, kpiC, kpiD });
    } catch (error: any) {
      if (error instanceof DashboardRequestError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[DashboardController] Erro ao carregar KPIs:', error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs do Dashboard' });
    }
  };
}
