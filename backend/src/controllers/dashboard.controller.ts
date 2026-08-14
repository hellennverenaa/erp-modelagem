import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { OcorrenciaProducao, StatusOcorrencia } from '../entities/OcorrenciaProducao';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { Retrabalho } from '../entities/Retrabalho';
import { Anexo } from '../entities/Anexo';

/** Retorna 0 se o valor for null/undefined/NaN */
function safeNum(val: number | null | undefined, decimals = 2): number {
  if (val == null || isNaN(val as number)) return 0;
  return Number((val as number).toFixed(decimals));
}

export class DashboardController {
  public getKpis = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const agora = new Date();

      // ==========================================
      // KPI A: LEAD TIME ABSOLUTO + DOWNTIME + ORDENS EM ANDAMENTO
      // ==========================================
      // Busca TODAS as ordens ativas sem filtro de data de 30 dias e sem take(30)
      const ordensAtivas = await AppDataSource
        .getRepository(OrdemTeste)
        .createQueryBuilder('ordem')
        .leftJoinAndSelect('ordem.rastreamentos', 'rastreamento')
        .leftJoinAndSelect('ordem.modelo', 'modelo')
        .leftJoinAndSelect('modelo.marca', 'marca')
        .where('ordem.status IN (:...statuses)', {
          statuses: [
            OrdemTesteStatus.EM_CORTE,
            OrdemTesteStatus.COSTURA,
            OrdemTesteStatus.MONTAGEM,
            OrdemTesteStatus.LABORATORIO,
            OrdemTesteStatus.AGUARDANDO_RESULTADO_FINAL,
            OrdemTesteStatus.APROVACAO_CONCESSAO,
            OrdemTesteStatus.APROVADO,
            OrdemTesteStatus.LIBERADO_PRODUCAO,
          ]
        })
        .orderBy('ordem.dataInicio', 'DESC')
        .getMany();

      const leadTimeResultados: {
        codigoBarras: string;
        tipoLote: string;
        leadTimeHoras: number;
        downtimeHoras: number;
        modelo: string;
        marca: string;
        dataInicio: Date;
      }[] = [];

      for (const ordem of ordensAtivas) {
        const rastreamentos = ordem.rastreamentos ?? [];
        
        // Regra Especial: Ordem no chão de fábrica mas que ainda não teve nenhuma bipagem
        if (rastreamentos.length === 0) {
            const tempoDecorridoMin = Math.max(0, Math.floor((agora.getTime() - (ordem.dataInicio?.getTime() || agora.getTime())) / 60000));
            leadTimeResultados.push({
                codigoBarras: ordem.codigoBarras,
                tipoLote: 'LOTE_PRINCIPAL', // Fallback assumido
                leadTimeHoras: safeNum(tempoDecorridoMin / 60),
                downtimeHoras: 0,
                modelo: ordem.modelo?.nome ?? 'N/A',
                marca: ordem.modelo?.marca?.nome ?? 'N/A',
                dataInicio: ordem.dataInicio
            });
            continue; // Já adicionou a ordem, vai para a próxima
        }

        const byLote: Record<string, typeof rastreamentos> = {
          CAIXA_TESTE: [],
          LOTE_PRINCIPAL: []
        };

        for (const r of rastreamentos) {
          if (r.tipoLote === 'CAIXA_TESTE') byLote.CAIXA_TESTE.push(r);
          else byLote.LOTE_PRINCIPAL.push(r);
        }

        for (const [tipo, trackings] of Object.entries(byLote)) {
          if (trackings.length === 0) continue;

          let totalMinAbsoluto = 0;
          let totalDowntimeMin = 0;

          for (const r of trackings) {
            if (r.dataSaida) {
              totalMinAbsoluto += r.tempoPermanenciaMin ?? 0;
            } else {
              const entrada = r.dataEntrada ?? r.createdAt;
              totalMinAbsoluto += Math.max(0, Math.floor((agora.getTime() - entrada.getTime()) / 60000));
            }

            const occurrences = await AppDataSource
              .getRepository(OcorrenciaProducao)
              .createQueryBuilder('oc')
              .where('oc.rastreamentoId = :rid', { rid: r.id })
              .andWhere('oc.interrompeSla = :sla', { sla: true })
              .getMany();

            for (const oc of occurrences) {
              const end = oc.dataResolucao?.getTime() ?? agora.getTime();
              totalDowntimeMin += Math.max(0, Math.floor((end - oc.dataOcorrencia.getTime()) / 60000));
            }
          }

          leadTimeResultados.push({
            codigoBarras: ordem.codigoBarras,
            tipoLote: tipo,
            leadTimeHoras: safeNum(totalMinAbsoluto / 60),
            downtimeHoras: safeNum(totalDowntimeMin / 60),
            modelo: ordem.modelo?.nome ?? 'N/A',
            marca: ordem.modelo?.marca?.nome ?? 'N/A',
            dataInicio: ordem.dataInicio
          });
        }
      }

      leadTimeResultados.sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime());

      const ctList = leadTimeResultados.filter(r => r.tipoLote === 'CAIXA_TESTE');
      const lpList = leadTimeResultados.filter(r => r.tipoLote === 'LOTE_PRINCIPAL');

      const avgCT = ctList.length > 0
        ? ctList.slice(0, 5).reduce((s, c) => s + c.leadTimeHoras, 0) / Math.min(5, ctList.length)
        : 0;

      const avgLP = lpList.length > 0
        ? lpList.slice(0, 5).reduce((s, c) => s + c.leadTimeHoras, 0) / Math.min(5, lpList.length)
        : 0;

      // Downtime global de TODA a base ativa
      const ocDowntime = await AppDataSource
        .getRepository(OcorrenciaProducao)
        .createQueryBuilder('oc')
        .where('oc.interrompeSla = :sla', { sla: true })
        .getMany();

      let downtimeTotalMinGlobal = 0;
      const motivosMap: Record<string, { minutos: number; quantidade: number }> = {};

      const tipoRotulos: Record<string, string> = {
        GARGALO_MAQUINA: 'Quebra / Parada de Máquina',
        FALTA_MATERIAL: 'Falta de Insumos / Materiais',
        PROBLEMA_QUALIDADE: 'Divergência de Qualidade',
        BLOQUEIO_PROCESSO: 'Bloqueio de Processo',
        ACIDENTE_TRABALHO: 'Acidente de Trabalho',
        OUTRO: 'Outros Motivos'
      };

      for (const oc of ocDowntime) {
        const end = oc.dataResolucao?.getTime() ?? agora.getTime();
        const min = Math.max(0, Math.floor((end - oc.dataOcorrencia.getTime()) / 60000));
        downtimeTotalMinGlobal += min;

        const nomeMotivo = tipoRotulos[oc.tipoOcorrencia] ?? oc.titulo ?? 'Outros Motivos';
        if (!motivosMap[nomeMotivo]) motivosMap[nomeMotivo] = { minutos: 0, quantidade: 0 };
        motivosMap[nomeMotivo].minutos += min;
        motivosMap[nomeMotivo].quantidade += 1;
      }

      const motivosParada = Object.entries(motivosMap).map(([motivo, d]) => ({
        motivo,
        minutos: d.minutos,
        horas: safeNum(d.minutos / 60, 1),
        quantidade: d.quantidade,
        percentual: safeNum(downtimeTotalMinGlobal > 0 ? (d.minutos / downtimeTotalMinGlobal) * 100 : 0, 1)
      }));
      motivosParada.sort((a, b) => b.minutos - a.minutos);

      const kpiA = {
        totalOrdensAtivas: ordensAtivas.length, // Propriedade nova solicitada
        mediaCaixaTeste: safeNum(avgCT),
        mediaLotePrincipal: safeNum(avgLP),
        downtimeTotalMin: downtimeTotalMinGlobal,
        downtimeTotalHoras: safeNum(downtimeTotalMinGlobal / 60, 1),
        motivosParada,
        grafico: leadTimeResultados.slice(0, 10)
      };

      // ==========================================
      // KPI B: MAPA DE GARGALOS
      // ==========================================
      const ocorrencias = await AppDataSource
        .getRepository(OcorrenciaProducao)
        .createQueryBuilder('oc')
        .leftJoinAndSelect('oc.setor', 'setor')
        .leftJoinAndSelect('oc.reportadoPor', 'reporter')
        .leftJoinAndSelect('oc.ordemTeste', 'ordem')
        .where('oc.status IN (:...statuses)', {
          statuses: [StatusOcorrencia.ABERTA, StatusOcorrencia.EM_ANALISE]
        })
        .orderBy('oc.dataOcorrencia', 'DESC')
        .getMany();

      const gravityOrder: Record<string, number> = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAIXA: 4 };
      ocorrencias.sort((a, b) => {
        const diff = (gravityOrder[a.gravidade] ?? 99) - (gravityOrder[b.gravidade] ?? 99);
        return diff !== 0 ? diff : b.dataOcorrencia.getTime() - a.dataOcorrencia.getTime();
      });

      const oIds = ocorrencias.map(o => o.id);
      const anexos = oIds.length > 0
        ? await AppDataSource.getRepository(Anexo).find({
            where: { entidadeTipo: 'ocorrencias_producao', entidadeId: In(oIds) }
          })
        : [];

      const kpiB = ocorrencias.map(o => {
        const oAnexos = anexos.filter(a => a.entidadeId === o.id);
        return {
          id: o.id,
          titulo: o.titulo ?? '',
          descricao: o.descricao ?? '',
          tipoOcorrencia: o.tipoOcorrencia,
          gravidade: o.gravidade,
          status: o.status,
          dataOcorrencia: o.dataOcorrencia,
          setor: o.setor?.nome ?? 'N/A',
          reportadoPor: o.reportadoPor?.nomeCompleto ?? 'N/A',
          totalFotos: oAnexos.length,
          fotos: oAnexos.map(a => a.caminhoArquivo)
        };
      });

      // ==========================================
      // KPI C: FPY
      // ==========================================
      const inspecoes = await AppDataSource
        .getRepository(Inspecao)
        .createQueryBuilder('insp')
        .leftJoinAndSelect('insp.setor', 'setor')
        .where('insp.tipoInspecao = :tipo', { tipo: TipoInspecao.SAIDA_SETOR })
        .getMany(); // Sem filtro de data

      const fpyPorSetor: Record<string, { total: number; aprovadas: number }> = {};
      let totalInspGlobal = 0;
      let aprovadasGlobal = 0;

      for (const insp of inspecoes) {
        const setor = insp.setor?.nome ?? 'SETOR DESCONHECIDO';
        if (!fpyPorSetor[setor]) fpyPorSetor[setor] = { total: 0, aprovadas: 0 };
        fpyPorSetor[setor].total += 1;
        totalInspGlobal += 1;

        if (
          insp.resultado === ResultadoInspecao.APROVADO ||
          insp.resultado === ResultadoInspecao.APROVADO_CONCESSAO
        ) {
          fpyPorSetor[setor].aprovadas += 1;
          aprovadasGlobal += 1;
        }
      }

      const fpySetores = Object.entries(fpyPorSetor).map(([setor, d]) => ({
        setor,
        totalInspecoes: d.total,
        totalRastreamentos: d.total,
        aprovadasPrimeira: d.aprovadas,
        fpyPercentual: safeNum(d.total > 0 ? (d.aprovadas / d.total) * 100 : 100)
      }));

      fpySetores.sort((a, b) => a.fpyPercentual - b.fpyPercentual);

      const kpiC = {
        fpyGlobal: safeNum(totalInspGlobal > 0 ? (aprovadasGlobal / totalInspGlobal) * 100 : 100),
        setores: fpySetores
      };

      // ==========================================
      // KPI D: RETRABALHO
      // ==========================================
      const retrabalhos = await AppDataSource
        .getRepository(Retrabalho)
        .createQueryBuilder('rt')
        .leftJoinAndSelect('rt.setorOrigem', 'setorOrigem')
        .leftJoinAndSelect('rt.divergencia', 'divergencia')
        .getMany(); // Sem filtro de data

      const rtPorSetor: Record<string, { total: number; tempos: number[]; divs: Set<string> }> = {};
      let totalRtGlobal = 0;

      for (const rt of retrabalhos) {
        const setor = rt.setorOrigem?.nome ?? 'SETOR DESCONHECIDO';
        if (!rtPorSetor[setor]) rtPorSetor[setor] = { total: 0, tempos: [], divs: new Set() };

        rtPorSetor[setor].total += 1;
        totalRtGlobal += 1;

        if (rt.dataInicio && rt.dataFim) {
          rtPorSetor[setor].tempos.push(
            Math.max(0, Math.floor((rt.dataFim.getTime() - rt.dataInicio.getTime()) / 60000))
          );
        }

        if (rt.divergencia?.tipoDivergencia) {
          rtPorSetor[setor].divs.add(rt.divergencia.tipoDivergencia);
        }
      }

      const retrabalhoSetores = Object.entries(rtPorSetor).map(([setor, d]) => {
        const avgTime = d.tempos.length > 0
          ? Math.round(d.tempos.reduce((s, v) => s + v, 0) / d.tempos.length)
          : 0;
        return {
          setorOrigem: setor,
          totalRetrabalhos: d.total,
          tempoMedioMin: avgTime,
          tiposDivergencia: Array.from(d.divs).join(', ') || 'Não especificada',
          percentualDoTotal: safeNum(totalRtGlobal > 0 ? (d.total / totalRtGlobal) * 100 : 0)
        };
      });

      retrabalhoSetores.sort((a, b) => b.totalRetrabalhos - a.totalRetrabalhos);

      const kpiD = {
        totalRetrabalhos: totalRtGlobal,
        setores: retrabalhoSetores
      };

      return res.json({ kpiA, kpiB, kpiC, kpiD });

    } catch (error: any) {
      console.error('[DashboardController] Erro ao carregar KPIs:', error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs do Dashboard' });
    }
  }
}
