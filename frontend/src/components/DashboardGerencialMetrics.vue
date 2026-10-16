<script setup lang="ts">
import { computed, ref, toRefs, watch } from 'vue'
import {
  Activity,
  Check,
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck
} from '@lucide/vue'
import type { GargaloItem, KpiAData, KpiCData, KpiDData } from '../types/dashboardGerencial'

const props = defineProps<{
  kpiA: KpiAData
  kpiB: GargaloItem[]
  kpiC: KpiCData
  kpiD: KpiDData
  formatHour: (value: number | null | undefined) => string
  formatDate: (value: string) => string
}>()
const { kpiA, kpiB, kpiC, kpiD, formatHour, formatDate } = toRefs(props)
const activePointIndex = ref<number | null>(0)
const leadTimeNumberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

const emit = defineEmits<{
  (event: 'abrir-galeria', fotos: string[]): void
}>()

watch(() => props.kpiA.grafico.length, quantidade => {
  activePointIndex.value = quantidade > 0 ? 0 : null
}, { immediate: true })

const activeLeadTime = computed(() => {
  const index = activePointIndex.value
  return index === null ? null : props.kpiA.grafico[index] ?? null
})

const leadTimeMaxValue = computed(() => Math.max(...props.kpiA.grafico.map(item => item.leadTimeHoras), 0))
const leadTimeChartItems = computed(() => props.kpiA.grafico.map((item, index) => ({
  item,
  index,
  altura: leadTimeMaxValue.value > 0
    ? Math.max(0, (item.leadTimeHoras / leadTimeMaxValue.value) * 100)
    : 0,
  cor: corMarca(item.marca)
})))
const fpySemDados = computed(() => props.kpiC.fpyGlobal === null && props.kpiC.totalInspecoes === 0)

function larguraLeadTime(value: number) {
  const maxValue = Math.max(props.kpiA.mediaCaixaTeste, props.kpiA.mediaLotePrincipal, 0)
  if (maxValue <= 0) return 0
  return Math.min(100, Math.max(0, (value / maxValue) * 100))
}

function rotuloLeadTime(value: number) {
  return leadTimeNumberFormatter.format(value) + 'h'
}

function corMarca(marca: string) {
  const nome = (marca || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR')
  if (nome.includes('NIKE')) return '#DC2626'
  if (nome.includes('FILA')) return '#2563EB'
  return '#64748B'
}

function rotuloTipoLote(tipoLote: string) {
  if (tipoLote === 'LOTE_PRINCIPAL') return 'Lote Principal'
  if (tipoLote === 'CAIXA_TESTE') return 'Caixa Teste'
  return tipoLote || 'Tipo de lote não informado'
}

function resumoGargalosPorSetorEGravidade() {
  const agrupados = new Map<string, { setor: string; gravidade: string; quantidade: number }>()

  props.kpiB.forEach(item => {
    const setor = item.setor || 'N/A'
    const gravidade = (item.gravidade || 'BAIXA').toUpperCase()
    const chave = setor + '|' + gravidade
    const atual = agrupados.get(chave)

    if (atual) atual.quantidade += 1
    else agrupados.set(chave, { setor, gravidade, quantidade: 1 })
  })

  return [...agrupados.values()].sort((a, b) => b.quantidade - a.quantidade)
}

function classeGravidade(gravidade: string) {
  switch (gravidade.toUpperCase()) {
    case 'CRITICA':
    case 'CRÍTICA':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'ALTA':
      return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'MEDIA':
    case 'MÉDIA':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5">
    <!-- KPI A · WIP -->
    <section class="sm:col-span-1 lg:col-span-4 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="WIP total">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-500">WIP Total</p>
          <p class="mt-1 text-[11px] text-slate-400">Ordens ativas no fluxo de produção</p>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Em acompanhamento</span>
      </div>
      <div class="mt-5 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{{ kpiA.totalOrdensAtivas }}</div>
      <div class="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p class="text-[10px] leading-snug text-slate-500">Total de ordens ativas em acompanhamento</p>
        <span class="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-indigo-700">
          <span class="relative flex h-2 w-2">
            <span v-if="kpiA.totalOrdensAtivas > 0" class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full" :class="kpiA.totalOrdensAtivas > 0 ? 'bg-indigo-600' : 'bg-slate-300'"></span>
          </span>
          {{ kpiA.totalOrdensAtivas > 0 ? 'Fluxo ativo' : 'Sem ordens ativas' }}
        </span>
      </div>
    </section>

    <!-- KPI A · Lead Time Caixa Teste -->
    <section class="sm:col-span-1 lg:col-span-4 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="Lead time da Caixa Teste">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-700">Lead Time · Caixa Teste</p>
          <p class="mt-1 text-[11px] leading-snug text-slate-400">Tempo médio de validação do modelo piloto</p>
        </div>
        <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">Lote Piloto</span>
      </div>
      <div class="mt-5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{{ formatHour(kpiA.mediaCaixaTeste) }}</div>
      <div class="mt-auto pt-5">
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" aria-label="Comparação visual entre os tempos médios dos dois tipos de lote">
          <div class="h-full rounded-full bg-indigo-600 transition-all duration-500" :style="{ width: larguraLeadTime(kpiA.mediaCaixaTeste) + '%' }"></div>
        </div>
        <p class="mt-2 text-[10px] leading-snug text-slate-400">Média de até 5 caixas piloto mais recentes em acompanhamento</p>
      </div>
    </section>

    <!-- KPI A · Lead Time Lote Principal -->
    <section class="sm:col-span-1 lg:col-span-4 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="Lead time do Lote Principal">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-700">Lead Time · Lote Principal</p>
          <p class="mt-1 text-[11px] leading-snug text-slate-400">Tempo médio do lote principal no fluxo de produção</p>
        </div>
        <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">Produção em Escala</span>
      </div>
      <div class="mt-5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{{ formatHour(kpiA.mediaLotePrincipal) }}</div>
      <div class="mt-auto pt-5">
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" aria-label="Comparação visual entre os tempos médios dos dois tipos de lote">
          <div class="h-full rounded-full bg-indigo-600 transition-all duration-500" :style="{ width: larguraLeadTime(kpiA.mediaLotePrincipal) + '%' }"></div>
        </div>
        <p class="mt-2 text-[10px] leading-snug text-slate-400">Média de até 5 lotes principais mais recentes em acompanhamento</p>
      </div>
    </section>

    <!-- Lead Time · 8 colunas -->
    <section class="sm:col-span-2 lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div class="flex items-center gap-2 text-indigo-600">
            <Activity :size="16" />
            <span class="text-[10px] font-semibold uppercase tracking-[0.14em]">Acompanhamento da produção</span>
          </div>
          <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">Variação do Lead Time</h2>
          <p class="mt-1 max-w-2xl text-[11px] leading-snug text-slate-500">Compare o tempo do Lote Principal mais recente de cada modelo em acompanhamento</p>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">{{ kpiA.grafico.length }} {{ kpiA.grafico.length === 1 ? 'modelo' : 'modelos' }}</span>
      </div>

      <div v-if="kpiA.grafico.length > 0" class="pt-4">
        <div class="overflow-x-auto pb-2">
          <ul
            class="grid min-w-[760px] gap-2 sm:gap-3"
            :style="{ gridTemplateColumns: 'repeat(' + leadTimeChartItems.length + ', minmax(0, 1fr))' }"
            aria-label="Lead time por modelo"
          >
            <li
              v-for="point in leadTimeChartItems"
              :key="point.item.codigoBarras + '-' + point.index"
              class="min-w-0"
            >
              <button
                type="button"
                class="flex min-h-[270px] w-full min-w-0 flex-col items-center rounded-lg border px-1.5 pb-2 pt-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 sm:px-2"
                :class="activePointIndex === point.index ? 'border-indigo-200 bg-indigo-50/60' : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'"
                :aria-pressed="activePointIndex === point.index"
                :aria-label="'Selecionar modelo ' + (point.item.modelo || 'não informado') + ', marca ' + (point.item.marca || 'não informada') + ', Lead Time ' + rotuloLeadTime(point.item.leadTimeHoras)"
                @mouseenter="activePointIndex = point.index"
                @focus="activePointIndex = point.index"
                @click="activePointIndex = point.index"
              >
                <div class="relative h-48 w-full shrink-0" aria-hidden="true">
                  <div class="absolute inset-x-0 bottom-0 top-[60px] flex items-end justify-center border-b border-slate-200">
                    <span
                      class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-slate-700 tabular-nums sm:text-[11px]"
                      :style="{ bottom: 'calc(' + point.altura + '% + 31px)' }"
                    >{{ rotuloLeadTime(point.item.leadTimeHoras) }}</span>
                    <svg
                      viewBox="0 0 48 36"
                      class="absolute left-1/2 h-6 w-8 -translate-x-1/2"
                      :style="{ bottom: 'calc(' + point.altura + '% + 3px)', color: point.cor }"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m10.2 20.7 3.2-7.1a2.2 2.2 0 0 1 3.1-.9l5.1 3.2 5 4.1c1.3 1.1 3 1.7 4.7 1.7h7.1a4.2 4.2 0 0 1 4.2 4.2v1.4c0 1.4-1.1 2.5-2.5 2.5H9.3a5.2 5.2 0 0 1-3.7-8.9l4.6-4.6Z" fill="currentColor" />
                      <path d="m17.4 14.3 4.6 2.9m-6.2.2 4.6 2.8m-6.2.2 4.6 2.8M8.4 27.8h32.7" fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
                    </svg>
                    <div
                      class="w-7 rounded-t-md transition-all duration-500 sm:w-9"
                      :style="{ height: Math.max(point.item.leadTimeHoras > 0 ? 2 : 0, point.altura) + '%', backgroundColor: point.cor }"
                    ></div>
                  </div>
                </div>
                <p class="mt-2 w-full truncate text-[10px] font-semibold text-slate-800" :title="point.item.modelo || 'Modelo não informado'">{{ point.item.modelo || 'Modelo não informado' }}</p>
                <p class="w-full truncate text-[9px] font-medium" :style="{ color: point.cor }" :title="point.item.marca || 'Marca não informada'">{{ point.item.marca || 'Marca não informada' }}</p>
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div v-else class="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
        <Activity :size="20" class="text-slate-300" />
        <p class="text-sm font-medium text-slate-500">Ainda não há modelos com Lote Principal em acompanhamento.</p>
      </div>

      <article v-if="activeLeadTime" class="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" aria-live="polite" aria-label="Detalhes do modelo selecionado">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[9px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Modelo selecionado</p>
            <h3 class="mt-1 truncate text-sm font-semibold text-slate-900">
              {{ activeLeadTime.modelo || 'Modelo não informado' }}
              <span v-if="activeLeadTime.marca" class="font-medium text-slate-500">· {{ activeLeadTime.marca }}</span>
            </h3>
          </div>
          <span class="shrink-0 rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
            {{ rotuloTipoLote(activeLeadTime.tipoLote) }}
          </span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div class="min-w-0">
            <p class="text-[9px] font-medium text-slate-500">Código / OP</p>
            <p class="mt-0.5 truncate text-[11px] font-semibold text-slate-800 tabular-nums" :title="activeLeadTime.codigoBarras">{{ activeLeadTime.codigoBarras || 'Não informado' }}</p>
          </div>
          <div>
            <p class="text-[9px] font-medium text-slate-500">Tempo de ciclo</p>
            <p class="mt-0.5 text-[11px] font-semibold text-slate-800 tabular-nums">{{ rotuloLeadTime(activeLeadTime.leadTimeHoras) }}</p>
          </div>
          <div>
            <p class="text-[9px] font-medium text-slate-500">Início do ciclo</p>
            <p class="mt-0.5 text-[11px] font-semibold text-slate-800 tabular-nums">{{ formatDate(activeLeadTime.dataInicio) }}</p>
          </div>
        </div>
      </article>
    </section>

    <!-- Saúde Operacional · 4 colunas -->
    <section class="sm:col-span-2 lg:col-span-4 rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-600">Visão de fábrica</p>
          <h2 class="mt-1 text-base font-semibold tracking-tight text-slate-900">Saúde Operacional</h2>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 tabular-nums">{{ kpiB.length }} ativos</span>
      </header>

      <div class="divide-y divide-slate-200/80">
        <section class="p-5">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold text-slate-800">Gargalos Operacionais</h3>
            <span class="text-[10px] text-slate-400 tabular-nums">{{ kpiB.length }} ocorr.</span>
          </div>

          <p v-if="kpiB.length === 0" class="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
            <Check :size="14" class="shrink-0" />
            Setores livres — nenhum lote travado aguardando liberação
          </p>
          <div v-else>
            <div class="mb-3 space-y-2">
              <div v-for="grupo in resumoGargalosPorSetorEGravidade()" :key="grupo.setor + grupo.gravidade" class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-[10px] font-medium text-slate-600">{{ grupo.setor }}</span>
                  <span class="shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase" :class="classeGravidade(grupo.gravidade)">{{ grupo.gravidade }}</span>
                </div>
                <span class="text-[10px] font-semibold text-slate-600 tabular-nums">{{ grupo.quantidade }}</span>
                <div class="col-span-2 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-indigo-500" :style="{ width: (grupo.quantidade / Math.max(1, kpiB.length) * 100) + '%' }"></div>
                </div>
              </div>
            </div>

            <div class="max-h-56 space-y-2 overflow-y-auto pr-1">
              <article v-for="oc in kpiB" :key="oc.id" class="rounded-lg border border-slate-200 p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase" :class="classeGravidade(oc.gravidade)">{{ oc.gravidade }}</span>
                      <span class="truncate text-[9px] font-semibold uppercase text-slate-500">{{ oc.setor }}</span>
                      <span class="text-[9px] text-slate-400">{{ formatDate(oc.dataOcorrencia) }}</span>
                    </div>
                    <h4 class="mt-1 truncate text-xs font-semibold text-slate-800" :title="oc.titulo">{{ oc.titulo }}</h4>
                    <p class="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500" :title="oc.descricao">{{ oc.descricao }}</p>
                    <p class="mt-1 text-[9px] text-slate-400">Reportado por {{ oc.reportadoPor }}</p>
                  </div>
                  <button
                    v-if="oc.fotos && oc.fotos.length > 0"
                    type="button"
                    class="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    @click="emit('abrir-galeria', oc.fotos)"
                    :aria-label="'Abrir ' + (oc.totalFotos || oc.fotos.length) + ' fotos da ocorrência'"
                    :title="'Abrir galeria · ' + (oc.totalFotos || oc.fotos.length) + ' fotos'"
                  >
                    <ImageIcon :size="12" />
                    {{ oc.totalFotos || oc.fotos.length }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

      </div>
    </section>

    <!-- FPY · 5 colunas -->
    <section class="sm:col-span-1 lg:col-span-5 flex min-h-[315px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:p-6">
      <header class="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck :size="18" />
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Qualidade fabril</p>
            <h2 class="mt-1 text-base font-semibold tracking-tight text-slate-900">First Pass Yield (FPY)</h2>
            <p class="mt-1 max-w-xs text-[10px] leading-snug text-slate-500">Percentual de peças aprovadas de primeira (sem precisar de conserto)</p>
          </div>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] text-slate-500">Ciclo monitorado</span>
      </header>

      <div class="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 py-3 sm:gap-4">
        <div class="flex min-w-0 items-center justify-center">
          <svg viewBox="0 0 200 120" class="w-full max-w-[210px]" role="img" :aria-label="fpySemDados ? 'FPY sem dados no ciclo' : 'Medidor semicircular de FPY'">
          <path
            d="M 18 98 A 82 82 0 0 1 182 98"
            fill="none"
            stroke="#E2E8F0"
            stroke-width="12"
            stroke-linecap="round"
            :stroke-dasharray="fpySemDados ? '3 6' : 'none'"
          />
          <path
            v-if="kpiC.fpyGlobal !== null && kpiC.totalInspecoes > 0"
            d="M 18 98 A 82 82 0 0 1 182 98"
            fill="none"
            stroke="#10B981"
            stroke-width="12"
            stroke-linecap="round"
            pathLength="100"
            stroke-dasharray="100"
            :stroke-dashoffset="100 - Math.min(100, Math.max(0, kpiC.fpyGlobal))"
          />
          <circle v-if="kpiC.fpyGlobal === 0 && kpiC.totalInspecoes > 0" cx="18" cy="98" r="5" fill="#E11D48" />
          <text x="100" y="82" text-anchor="middle" fill="#0F172A" font-size="27" font-weight="700" class="tabular-nums">
            {{ kpiC.fpyGlobal === null ? '—' : kpiC.fpyGlobal + '%' }}
          </text>
          <text x="100" y="101" text-anchor="middle" fill="#64748B" font-size="9">FPY GLOBAL</text>
          </svg>
        </div>

        <div class="min-w-0 space-y-2">
          <span
            class="inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold leading-tight"
            :class="fpySemDados
              ? 'border-slate-200 bg-slate-50 text-slate-500'
              : kpiC.fpyGlobal === 0 && kpiC.totalInspecoes > 0
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : kpiC.fpyGlobal === null
                  ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
          >
            {{ fpySemDados
              ? 'Sem dados no ciclo'
              : kpiC.fpyGlobal === 0 && kpiC.totalInspecoes > 0
                ? '0% de aprovação'
                : kpiC.fpyGlobal === null
                  ? 'Percentual indisponível'
                  : 'Indicador calculado' }}
          </span>
          <div>
            <p class="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{{ kpiC.totalInspecoes }}</p>
            <p class="text-[10px] leading-snug text-slate-500">{{ kpiC.totalInspecoes === 1 ? 'inspeção de saída registrada' : 'inspeções de saída registradas' }}</p>
          </div>
          <p class="text-[10px] leading-snug text-slate-400">
            {{ fpySemDados ? 'Ainda não há inspeções de saída de setor registradas.' : 'Aprovação na primeira inspeção de saída.' }}
          </p>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4">
        <div v-if="kpiC.setores.length > 0" class="max-h-24 space-y-2.5 overflow-y-auto pr-1">
          <div v-for="item in kpiC.setores" :key="item.setor">
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-[10px] font-semibold text-slate-700">{{ item.setor }}</span>
              <span class="shrink-0 text-[10px] font-semibold text-slate-700 tabular-nums">{{ item.fpyPercentual }}%</span>
            </div>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-emerald-500" :style="{ width: Math.min(100, Math.max(0, item.fpyPercentual)) + '%' }"></div>
            </div>
            <p class="mt-1 text-[9px] text-slate-400 tabular-nums">
              {{ item.aprovadasPrimeira }} aprovadas · {{ item.totalInspecoes > 0 ? item.totalInspecoes : item.totalRastreamentos }} consideradas
            </p>
          </div>
        </div>
        <p v-else class="text-[10px] text-slate-400">Sem detalhamento por setor na resposta atual.</p>
      </div>
    </section>

    <!-- Retrabalho · 7 colunas -->
    <section class="sm:col-span-1 lg:col-span-7 flex min-h-[315px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:p-6">
      <header class="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <RotateCcw :size="17" />
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700">Histórico acumulado</p>
            <h2 class="mt-1 text-base font-semibold tracking-tight text-slate-900">Índice de Retrabalho por Setor de Origem</h2>
            <p class="mt-1 max-w-xl text-[10px] leading-snug text-slate-500">Setores que originaram defeitos ou necessidade de refazer a peça</p>
          </div>
        </div>
        <span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 tabular-nums">
          {{ kpiD.totalRetrabalhos }} {{ kpiD.totalRetrabalhos === 1 ? 'caso' : 'casos' }}
        </span>
      </header>

      <div v-if="kpiD.totalRetrabalhos === 0" class="mt-4 flex flex-1 flex-col justify-center gap-4">
        <div class="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-4 py-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-100">
            <Check :size="17" />
          </span>
          <div>
            <p class="text-xs font-semibold text-emerald-800">Monitoramento estável</p>
            <p class="mt-0.5 text-[10px] text-emerald-700">Nenhuma peça precisou voltar para conserto nos setores.</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3">
            <p class="text-[10px] font-medium text-slate-500">Ocorrências</p>
            <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">0</p>
            <p class="text-[9px] text-slate-400">registradas</p>
          </div>
          <div class="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3">
            <p class="text-[10px] font-medium text-slate-500">Reprocessamento</p>
            <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">0 <span class="text-sm font-semibold text-slate-500">min</span></p>
            <p class="text-[9px] text-slate-400">sem casos registrados</p>
          </div>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-emerald-100" aria-label="Nenhum retrabalho registrado">
          <div class="h-full w-full rounded-full bg-emerald-500/70"></div>
        </div>
      </div>
      <div v-else-if="kpiD.setores.length > 0" class="mt-4 max-h-[340px] flex-1 space-y-4 overflow-y-auto pr-1">
        <div v-for="item in kpiD.setores" :key="item.setorOrigem">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span class="text-xs font-semibold text-slate-800">{{ item.setorOrigem }}</span>
            <span class="text-[10px] font-semibold text-orange-700 tabular-nums">
              {{ item.totalRetrabalhos }} {{ item.totalRetrabalhos === 1 ? 'caso' : 'casos' }} · {{ item.percentualDoTotal }}% do total
            </span>
          </div>
          <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-orange-400 transition-all" :style="{ width: Math.min(100, Math.max(0, item.percentualDoTotal)) + '%' }"></div>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
            <span class="tabular-nums">Tempo médio: {{ item.tempoMedioMin }} min</span>
            <span v-if="item.tiposDivergencia" class="max-w-[70%] truncate text-right" :title="item.tiposDivergencia">{{ item.tiposDivergencia }}</span>
          </div>
        </div>
      </div>
      <p v-else class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
        Há casos registrados sem detalhamento por setor na resposta atual.
      </p>
    </section>
  </div>
</template>
