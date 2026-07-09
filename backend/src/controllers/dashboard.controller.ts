import { Request, Response } from 'express';
import { In, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { Rastreamento } from '../entities/Rastreamento';
import { OcorrenciaProducao, StatusOcorrencia } from '../entities/OcorrenciaProducao';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { Retrabalho } from '../entities/Retrabalho';
import { Anexo } from '../entities/Anexo';

export class DashboardController {
  public getKpis = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const agora = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      // ==========================================
      // KPI A: LEAD TIME
      // ==========================================
      const ordensLeadTime = await AppDataSource.getRepository(OrdemTeste).find({
        where: {
          status: In([
            OrdemTesteStatus.LABORATORIO,
            OrdemTesteStatus.AGUARDANDO_RESULTADO_FINAL,
            OrdemTesteStatus.APROVACAO_CONCESSAO,
            OrdemTesteStatus.APROVADO,
            OrdemTesteStatus.LIBERADO_PRODUCAO
          ])
        },
        relations: {
          modelo: { marca: true },
          rastreamentos: true
        },
        order: { dataInicio: 'DESC' },
        take: 30
      });

      const leadTimeResultados: {
        codigoBarras: string;
        tipoLote: string;
        leadTimeHoras: number;
        modelo: string;
        marca: string;
        dataInicio: Date;
      }[] = [];

      for (const ordem of ordensLeadTime) {
        const trackingsByLote: Record<string, Rastreamento[]> = {
          CAIXA_TESTE: [],
          LOTE_PRINCIPAL: []
        };

        for (const r of ordem.rastreamentos) {
          if (r.tipoLote === 'CAIXA_TESTE') {
            trackingsByLote.CAIXA_TESTE.push(r);
          } else {
            trackingsByLote.LOTE_PRINCIPAL.push(r);
          }
        }

        for (const [tipo, trackings] of Object.entries(trackingsByLote)) {
          if (trackings.length === 0) continue;

          let totalMinutos = 0;
          for (const r of trackings) {
            if (r.dataSaida) {
              totalMinutos += r.tempoPermanenciaMin || 0;
            } else {
              const dataEntrada = r.dataEntrada || r.createdAt;
              const timeSpentMs = agora.getTime() - dataEntrada.getTime();
              const timeSpentMin = Math.floor(timeSpentMs / 60000);

              const occurrences = await AppDataSource.getRepository(OcorrenciaProducao).find({
                where: {
                  rastreamentoId: r.id,
                  interrompeSla: true
                }
              });

              let pausedMs = 0;
              for (const oc of occurrences) {
                const end = oc.dataResolucao ? oc.dataResolucao.getTime() : agora.getTime();
                pausedMs += end - oc.dataOcorrencia.getTime();
              }

              const pausedMin = Math.floor(pausedMs / 60000);
              const activeMin = Math.max(0, timeSpentMin - pausedMin);
              totalMinutos += activeMin;
            }
          }

          const leadTimeHoras = Number((totalMinutos / 60).toFixed(2));
          leadTimeResultados.push({
            codigoBarras: ordem.codigoBarras,
            tipoLote: tipo,
            leadTimeHoras,
            modelo: ordem.modelo?.nome || 'N/A',
            marca: ordem.modelo?.marca?.nome || 'N/A',
            dataInicio: ordem.dataInicio
          });
        }
      }

      leadTimeResultados.sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime());

      const caixaTesteList = leadTimeResultados.filter(r => r.tipoLote === 'CAIXA_TESTE');
      const lotePrincipalList = leadTimeResultados.filter(r => r.tipoLote === 'LOTE_PRINCIPAL');

      const avg5CaixaTeste = caixaTesteList.slice(0, 5).reduce((acc, curr) => acc + curr.leadTimeHoras, 0) / Math.max(1, Math.min(5, caixaTesteList.length));
      const avg5LotePrincipal = lotePrincipalList.slice(0, 5).reduce((acc, curr) => acc + curr.leadTimeHoras, 0) / Math.max(1, Math.min(5, lotePrincipalList.length));

      const kpiA = {
        mediaCaixaTeste: Number(avg5CaixaTeste.toFixed(2)),
        mediaLotePrincipal: Number(avg5LotePrincipal.toFixed(2)),
        grafico: leadTimeResultados.slice(0, 10)
      };

      // ==========================================
      // KPI B: MAPA DE GARGALOS
      // ==========================================
      const ocorrencias = await AppDataSource.getRepository(OcorrenciaProducao).find({
        where: {
          status: In([StatusOcorrencia.ABERTA, StatusOcorrencia.EM_ANALISE])
        },
        relations: {
          setor: true,
          reportadoPor: true,
          ordemTeste: {
            modelo: true
          }
        }
      });

      const gravityOrder: Record<string, number> = {
        CRITICA: 1,
        ALTA: 2,
        MEDIA: 3,
        BAIXA: 4
      };

      ocorrencias.sort((a, b) => {
        const gA = gravityOrder[a.gravidade] || 99;
        const gB = gravityOrder[b.gravidade] || 99;
        if (gA !== gB) return gA - gB;
        return b.dataOcorrencia.getTime() - a.dataOcorrencia.getTime();
      });

      const oIds = ocorrencias.map(o => o.id);
      const anexos = oIds.length > 0 ? await AppDataSource.getRepository(Anexo).find({
        where: {
          entidadeTipo: 'ocorrencias_producao',
          entidadeId: In(oIds)
        }
      }) : [];

      const kpiB = ocorrencias.map(o => {
        const oAnexos = anexos.filter(a => a.entidadeId === o.id);
        return {
          id: o.id,
          titulo: o.titulo,
          descricao: o.descricao,
          tipoOcorrencia: o.tipoOcorrencia,
          gravidade: o.gravidade,
          status: o.status,
          dataOcorrencia: o.dataOcorrencia,
          setor: o.setor?.nome || 'N/A',
          reportadoPor: o.reportadoPor?.nomeCompleto || 'N/A',
          totalFotos: oAnexos.length,
          fotos: oAnexos.map(a => a.caminhoArquivo)
        };
      });

      // ==========================================
      // KPI C: FPY
      // ==========================================
      const inspecoes = await AppDataSource.getRepository(Inspecao).find({
        where: {
          tipoInspecao: TipoInspecao.SAIDA_SETOR,
          dataInspecao: MoreThanOrEqual(trintaDiasAtras)
        },
        relations: {
          setor: true
        }
      });

      const fpyPorSetor: Record<string, { total: number; aprovadas: number }> = {};
      let totalGlobal = 0;
      let aprovadasGlobal = 0;

      for (const insp of inspecoes) {
        const setorNome = insp.setor?.nome || 'SETOR DESCONHECIDO';
        if (!fpyPorSetor[setorNome]) {
          fpyPorSetor[setorNome] = { total: 0, aprovadas: 0 };
        }

        fpyPorSetor[setorNome].total += 1;
        totalGlobal += 1;

        if (insp.resultado === ResultadoInspecao.APROVADO || insp.resultado === ResultadoInspecao.APROVADO_CONCESSAO) {
          fpyPorSetor[setorNome].aprovadas += 1;
          aprovadasGlobal += 1;
        }
      }

      const fpySetores = Object.entries(fpyPorSetor).map(([setor, dados]) => {
        const fpy = dados.total > 0 ? (dados.aprovadas / dados.total) * 100 : 100;
        return {
          setor,
          totalInspecoes: dados.total,
          aprovadasPrimeira: dados.aprovadas,
          fpyPercentual: Number(fpy.toFixed(2))
        };
      });

      const fpyGlobalVal = totalGlobal > 0 ? (aprovadasGlobal / totalGlobal) * 100 : 100;

      const kpiC = {
        fpyGlobal: Number(fpyGlobalVal.toFixed(2)),
        setores: fpySetores
      };

      // ==========================================
      // KPI D: INDICE DE RETRABALHO
      // ==========================================
      const retrabalhos = await AppDataSource.getRepository(Retrabalho).find({
        where: {
          createdAt: MoreThanOrEqual(trintaDiasAtras)
        },
        relations: {
          setorOrigem: true,
          divergencia: true
        }
      });

      const retrabalhoPorSetor: Record<string, {
        total: number;
        tempos: number[];
        divergencias: Set<string>;
      }> = {};

      let totalRetrabalhosGlobal = 0;

      for (const rt of retrabalhos) {
        const setorNome = rt.setorOrigem?.nome || 'SETOR DESCONHECIDO';
        if (!retrabalhoPorSetor[setorNome]) {
          retrabalhoPorSetor[setorNome] = {
            total: 0,
            tempos: [],
            divergencias: new Set<string>()
          };
        }

        retrabalhoPorSetor[setorNome].total += 1;
        totalRetrabalhosGlobal += 1;

        if (rt.dataInicio && rt.dataFim) {
          const diffMs = rt.dataFim.getTime() - rt.dataInicio.getTime();
          const diffMin = Math.floor(diffMs / 60000);
          retrabalhoPorSetor[setorNome].tempos.push(diffMin);
        }

        if (rt.divergencia?.tipoDivergencia) {
          retrabalhoPorSetor[setorNome].divergencias.add(rt.divergencia.tipoDivergencia);
        }
      }

      const retrabalhoSetores = Object.entries(retrabalhoPorSetor).map(([setor, dados]) => {
        const avgTime = dados.tempos.length > 0
          ? Math.round(dados.tempos.reduce((sum, val) => sum + val, 0) / dados.tempos.length)
          : 0;

        const percent = totalRetrabalhosGlobal > 0 ? (dados.total / totalRetrabalhosGlobal) * 100 : 0;

        return {
          setorOrigem: setor,
          totalRetrabalhos: dados.total,
          tempoMedioMin: avgTime,
          tiposDivergencia: Array.from(dados.divergencias).join(', '),
          percentualDoTotal: Number(percent.toFixed(2))
        };
      });

      retrabalhoSetores.sort((a, b) => b.totalRetrabalhos - a.totalRetrabalhos);

      const kpiD = {
        totalRetrabalhos: totalRetrabalhosGlobal,
        setores: retrabalhoSetores
      };

      return res.json({
        kpiA,
        kpiB,
        kpiC,
        kpiD
      });

    } catch (error: any) {
      console.error('[DashboardController] Erro ao carregar KPIs:', error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs do Dashboard' });
    }
  }
}
