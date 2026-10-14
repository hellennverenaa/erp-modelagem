<script setup lang="ts">
import { computed, toRefs } from 'vue'
import {
  Activity,
  Check,
  Image as ImageIcon,
  PauseCircle,
  RotateCcw,
  ShieldCheck
} from '@lucide/vue'
import type { GargaloItem, KpiAData, KpiCData, KpiDData, LeadTimeItem } from '../types/dashboardGerencial'

const props = defineProps<{
  kpiA: KpiAData
  kpiB: GargaloItem[]
  kpiC: KpiCData
  kpiD: KpiDData
  formatHour: (value: number | null | undefined) => string
  formatMin: (value: number) => string
  formatDate: (value: string) => string
}>()
const { kpiA, kpiB, kpiC, kpiD, formatHour, formatMin, formatDate } = toRefs(props)

const emit = defineEmits<{
  (event: 'abrir-galeria', fotos: string[]): void
}>()

const leadTimePoints = computed(() => {
  const values = props.kpiA.grafico
  const maxValue = Math.max(...values.map(item => item.leadTimeHoras), 1)
  const xStart = 55
  const xEnd = 485
  const yTop = 18
  const yBottom = 78

  return values.map((item, index) => ({
    item,
    x: xStart + (index / Math.max(1, values.length - 1)) * (xEnd - xStart),
    y: yBottom - (item.leadTimeHoras / maxValue) * (yBottom - yTop)
  }))
})

const leadTimePath = computed(() => leadTimePoints.value
  .map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x.toFixed(1) + ' ' + point.y.toFixed(1))
  .join(' '))

const leadTimeAreaPath = computed(() => {
  const points = leadTimePoints.value
  if (points.length < 2) return ''

  const first = points[0]
  const last = points[points.length - 1]
  return leadTimePath.value + ' L ' + last.x.toFixed(1) + ' 78 L ' + first.x.toFixed(1) + ' 78 Z'
})

const leadTimeMaxValue = computed(() => Math.max(...props.kpiA.grafico.map(item => item.leadTimeHoras), 1))
const fpySemDados = computed(() => props.kpiC.fpyGlobal === null && props.kpiC.totalInspecoes === 0)

function larguraLeadTime(value: number) {
  const maxValue = Math.max(props.kpiA.mediaCaixaTeste, props.kpiA.mediaLotePrincipal, 0)
  if (maxValue <= 0) return 0
  return Math.min(100, Math.max(0, (value / maxValue) * 100))
}

function rotuloModelo(item: LeadTimeItem) {
  const modelo = (item.modelo || '').trim().toLocaleUpperCase('pt-BR')
  if (!modelo) return item.dataInicio ? props.formatDate(item.dataInicio) : item.codigoBarras || 'Ordem'
  if (modelo.startsWith('AIR MAX')) return 'AIR MAX…'
  if (modelo.startsWith('RACER CARBON')) {
    const numeroModelo = modelo.match(/\d+$/)?.[0]
    return numeroModelo ? 'RACER C. ' + numeroModelo : 'RACER C.'
  }
  if (modelo.startsWith('AIR WINFLO')) return 'AIR WINFLO'
  return modelo.length > 12 ? modelo.slice(0, 11) + '…' : modelo
}

function rotuloLeadTime(value: number) {
  return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + 'h'
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

function tituloPonto(item: LeadTimeItem) {
  return [
    'Modelo: ' + (item.modelo || '—'),
    'Marca: ' + (item.marca || '—'),
    'Código de barras: ' + (item.codigoBarras || '—'),
    'Tipo de lote: ' + (item.tipoLote || '—'),
    'Lead Time: ' + props.formatHour(item.leadTimeHoras),
    'Downtime: ' + props.formatHour(item.downtimeHoras),
    'Início: ' + (item.dataInicio || '—')
  ].join('\n')
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5">
    <!-- KPI A · WIP -->
    <section class="sm:col-span-1 lg:col-span-3 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="WIP total">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-500">WIP Total</p>
          <p class="mt-1 text-[11px] text-slate-400">Ordens ativas</p>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Em rota</span>
      </div>
      <div class="mt-5 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{{ kpiA.totalOrdensAtivas }}</div>
      <div class="mt-auto border-t border-slate-100 pt-3">
        <div class="flex items-center gap-2 text-[11px] text-slate-500">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-indigo-600"></span>
          </span>
        {{ kpiA.totalOrdensAtivas }} {{ kpiA.totalOrdensAtivas === 1 ? 'ordem ativa registrada' : 'ordens ativas registradas' }}
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label="Atividade de ordens em acompanhamento">
          <div class="h-full w-full origin-left rounded-full bg-indigo-500/70 animate-pulse"></div>
        </div>
      </div>
    </section>

    <!-- KPI A · Lead Time Caixa Teste -->
    <section class="sm:col-span-1 lg:col-span-3 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="Lead time da Caixa Teste">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-500">Lead Time</p>
          <p class="mt-1 text-[11px] text-slate-400">Caixa Teste</p>
        </div>
        <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">Média atual</span>
      </div>
      <div class="mt-5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{{ formatHour(kpiA.mediaCaixaTeste) }}</div>
      <div class="mt-auto pt-5">
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" :title="'Proporção em relação à maior média exibida'">
          <div class="h-full rounded-full bg-indigo-600 transition-all duration-500" :style="{ width: larguraLeadTime(kpiA.mediaCaixaTeste) + '%' }"></div>
        </div>
        <p class="mt-2 text-[10px] text-slate-400 tabular-nums">{{ Math.round(larguraLeadTime(kpiA.mediaCaixaTeste)) }}% da maior média atual</p>
      </div>
    </section>

    <!-- KPI A · Lead Time Lote Principal -->
    <section class="sm:col-span-1 lg:col-span-3 flex min-h-[210px] flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]" aria-label="Lead time do Lote Principal">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-slate-500">Lead Time</p>
          <p class="mt-1 text-[11px] text-slate-400">Lote Principal</p>
        </div>
        <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">Média atual</span>
      </div>
      <div class="mt-5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{{ formatHour(kpiA.mediaLotePrincipal) }}</div>
      <div class="mt-auto pt-5">
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" :title="'Proporção em relação à maior média exibida'">
          <div class="h-full rounded-full bg-indigo-600 transition-all duration-500" :style="{ width: larguraLeadTime(kpiA.mediaLotePrincipal) + '%' }"></div>
        </div>
        <p class="mt-2 text-[10px] text-slate-400 tabular-nums">{{ Math.round(larguraLeadTime(kpiA.mediaLotePrincipal)) }}% da maior média atual</p>
      </div>
    </section>

    <!-- KPI A · Downtime -->
    <section
      class="sm:col-span-1 lg:col-span-3 flex min-h-[210px] flex-col rounded-xl border p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
      :class="kpiA.downtimeTotalMin > 0 ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300' : 'border-slate-200/80 bg-white hover:border-slate-300/90'"
      aria-label="Downtime acumulado"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-1.5">
            <PauseCircle :size="14" :class="kpiA.downtimeTotalMin > 0 ? 'text-rose-600' : 'text-slate-500'" />
            <p class="text-xs font-semibold text-slate-500">Downtime Acumulado</p>
          </div>
          <p class="mt-1 text-[11px] text-slate-400">Paradas que pausaram o SLA</p>
        </div>
        <span
          class="inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold tabular-nums"
          :class="kpiA.downtimeTotalMin > 0 ? 'border-rose-200 bg-white text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
          :aria-label="kpiA.downtimeTotalMin > 0 ? kpiA.motivosParada.length + ' motivos de parada' : 'Sem pausas de SLA'"
        >
          <span v-if="kpiA.downtimeTotalMin > 0">{{ kpiA.motivosParada.length }}</span>
          <Check v-else :size="15" class="stroke-[2.5]" />
        </span>
      </div>
      <div class="mt-5 text-3xl font-bold tracking-tight tabular-nums" :class="kpiA.downtimeTotalMin > 0 ? 'text-rose-700' : 'text-slate-900'">
        {{ kpiA.downtimeTotalHoras }}h
      </div>
      <div class="mt-auto border-t border-slate-100 pt-3 text-[11px]" :class="kpiA.downtimeTotalMin > 0 ? 'text-rose-700' : 'text-emerald-700'">
        {{ kpiA.downtimeTotalMin > 0 ? kpiA.motivosParada.length + (kpiA.motivosParada.length === 1 ? ' motivo registrado' : ' motivos registrados') : 'Sem pausas de SLA' }}
        <span class="ml-1 tabular-nums text-slate-500">· {{ formatMin(kpiA.downtimeTotalMin) }}</span>
      </div>
    </section>

    <!-- Lead Time · 8 colunas -->
    <section class="sm:col-span-2 lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300/90 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div class="flex items-center gap-2 text-indigo-600">
            <Activity :size="16" />
            <span class="text-[10px] font-semibold uppercase tracking-[0.14em]">Telemetria do ciclo</span>
          </div>
          <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">Variação do Lead Time</h2>
        </div>
        <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">Ordens retornadas pela API</span>
      </div>

      <div v-if="kpiA.grafico.length > 1" class="pt-5">
        <div class="h-52 w-full">
          <svg
            viewBox="0 0 520 120"
            class="h-full w-full overflow-visible"
            role="img"
            aria-label="Variação do lead time das ordens retornadas pela API"
          >
            <defs>
              <linearGradient id="tc-lead-time-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#6366F1" stop-opacity="0.22" />
                <stop offset="55%" stop-color="#6366F1" stop-opacity="0.06" />
                <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line x1="45" y1="18" x2="500" y2="18" stroke="#E2E8F0" stroke-dasharray="4 4" />
            <line x1="45" y1="48" x2="500" y2="48" stroke="#E2E8F0" stroke-dasharray="4 4" />
            <line x1="45" y1="78" x2="500" y2="78" stroke="#CBD5E1" />
            <text x="2" y="21" fill="#94A3B8" font-size="9">{{ Math.round(leadTimeMaxValue) }}h</text>
            <text x="2" y="51" fill="#94A3B8" font-size="9">{{ Math.round(leadTimeMaxValue / 2) }}h</text>
            <text x="2" y="81" fill="#94A3B8" font-size="9">0h</text>
            <path :d="leadTimeAreaPath" fill="url(#tc-lead-time-area)" />
            <path :d="leadTimePath" fill="none" stroke="#4F46E5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <g v-for="(point, index) in leadTimePoints" :key="point.item.codigoBarras + '-' + index">
              <circle :cx="point.x" :cy="point.y" r="8" fill="#4F46E5" fill-opacity="0.12" />
              <text :x="point.x" :y="Math.max(10, point.y - 8)" text-anchor="middle" fill="#4338CA" font-size="9" font-weight="600" class="tabular-nums">{{ rotuloLeadTime(point.item.leadTimeHoras) }}</text>
              <circle :cx="point.x" :cy="point.y" r="3.5" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2.5" tabindex="0">
                <title>{{ tituloPonto(point.item) }}</title>
              </circle>
              <text :x="point.x" y="101" text-anchor="middle" fill="#64748B" font-size="8.5" font-weight="500">{{ rotuloModelo(point.item) }}</text>
            </g>
          </svg>
        </div>
        <p class="mt-2 text-[10px] text-slate-400">Passe o cursor ou foque um ponto para consultar os dados do ciclo.</p>
      </div>
      <div v-else class="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
        <Activity :size="20" class="text-slate-300" />
        <p class="text-sm font-medium text-slate-500">Dados insuficientes para exibir a variação.</p>
        <p class="text-[11px] text-slate-400">O gráfico requer mais de um registro retornado pela API.</p>
      </div>
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
            Nenhum gargalo ativo registrado
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

        <section class="p-5">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold text-slate-800">Motivos de Parada</h3>
            <span class="text-[9px] font-medium uppercase tracking-wide text-slate-400">Histórico acumulado</span>
          </div>

          <p v-if="kpiA.motivosParada.length === 0" class="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
            <Check :size="14" class="shrink-0" />
            Sem registros de parada no histórico consultado
          </p>
          <div v-else class="max-h-56 space-y-3 overflow-y-auto pr-1">
            <div v-for="item in kpiA.motivosParada" :key="item.motivo">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[10px] font-medium text-slate-700" :title="item.motivo">{{ item.motivo }}</span>
                <span class="shrink-0 text-[9px] text-slate-500 tabular-nums">{{ item.percentual }}%</span>
              </div>
              <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full bg-rose-400" :style="{ width: Math.min(100, Math.max(0, item.percentual)) + '%' }"></div>
              </div>
              <div class="mt-1 flex justify-between gap-2 text-[9px] text-slate-400">
                <span>{{ item.quantidade }} {{ item.quantidade === 1 ? 'registro' : 'registros' }}</span>
                <span class="tabular-nums">{{ formatMin(item.minutos) }} · {{ item.horas }}h</span>
              </div>
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
            <p class="text-[10px] leading-snug text-slate-500">{{ kpiC.totalInspecoes === 1 ? 'inspeção considerada' : 'inspeções consideradas' }}</p>
          </div>
          <p class="text-[10px] leading-snug text-slate-400">
            {{ fpySemDados ? 'Aguardando inspeções consideradas no ciclo.' : 'Qualidade aprovada na primeira inspeção.' }}
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
            <p class="mt-0.5 text-[10px] text-emerald-700">Nenhum caso retornado no histórico consultado.</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3">
            <p class="text-[10px] font-medium text-slate-500">Ocorrências</p>
            <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">0</p>
            <p class="text-[9px] text-slate-400">no histórico</p>
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
