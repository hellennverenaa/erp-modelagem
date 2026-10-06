<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api, { getApiOrigin } from '../api/axios'
import {
  Clock,
  AlertTriangle,
  TrendingUp,
  RotateCcw,
  Image as ImageIcon,
  X,
  PauseCircle,
  Wrench,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Check,
  Activity,
  Layers,
  ShieldCheck
} from 'lucide-vue-next'

// ==========================================
// INTERFACES (PRESERVADAS 100%)
// ==========================================
interface MotivoParada {
  motivo: string
  minutos: number
  horas: number
  quantidade: number
  percentual: number
}

interface LeadTimeItem {
  codigoBarras: string
  tipoLote: string
  leadTimeHoras: number
  downtimeHoras: number
  modelo: string
  marca: string
  dataInicio: string
}

interface KpiAData {
  totalOrdensAtivas: number
  mediaCaixaTeste: number
  mediaLotePrincipal: number
  downtimeTotalMin: number
  downtimeTotalHoras: number
  motivosParada: MotivoParada[]
  grafico: LeadTimeItem[]
}

interface GargaloItem {
  id: string
  titulo: string
  descricao: string
  tipoOcorrencia: string
  gravidade: string
  status: string
  dataOcorrencia: string
  setor: string
  reportadoPor: string
  totalFotos: number
  fotos: string[]
}

interface FpySetor {
  setor: string
  totalInspecoes: number
  totalRastreamentos: number
  aprovadasPrimeira: number
  fpyPercentual: number
}

interface RetrabalhoSetor {
  setorOrigem: string
  totalRetrabalhos: number
  tempoMedioMin: number
  tiposDivergencia: string
  percentualDoTotal: number
}

// ==========================================
// ESTADO REATIVO (PRESERVADO 100%)
// ==========================================
const loading = ref(true)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

const kpiA = ref<KpiAData>({
  totalOrdensAtivas: 0,
  mediaCaixaTeste: 0,
  mediaLotePrincipal: 0,
  downtimeTotalMin: 0,
  downtimeTotalHoras: 0,
  motivosParada: [],
  grafico: []
})

const kpiB = ref<GargaloItem[]>([])

const kpiC = ref<{ fpyGlobal: number | null; totalInspecoes: number; setores: FpySetor[] }>({
  fpyGlobal: null,
  totalInspecoes: 0,
  setores: []
})

const kpiD = ref<{ totalRetrabalhos: number; setores: RetrabalhoSetor[] }>({
  totalRetrabalhos: 0,
  setores: []
})

// Modal Galeria de Fotos
const modalGaleriaFotos = ref<string[] | null>(null)
const fotoIndexAtiva = ref(0)

// ==========================================
// BUSCA DE DADOS (PRESERVADA 100%)
// ==========================================
async function fetchKpis() {
  try {
    const res = await api.get('/dashboard/kpis')
    const raw = res.data
    console.log('[Dashboard] Payload completo da API recebido:', JSON.stringify(raw, null, 2))

    kpiA.value = {
      totalOrdensAtivas: raw.kpiA?.totalOrdensAtivas ?? 0,
      mediaCaixaTeste: raw.kpiA?.mediaCaixaTeste ?? 0,
      mediaLotePrincipal: raw.kpiA?.mediaLotePrincipal ?? 0,
      downtimeTotalMin: raw.kpiA?.downtimeTotalMin ?? 0,
      downtimeTotalHoras: raw.kpiA?.downtimeTotalHoras ?? 0,
      motivosParada: (raw.kpiA?.motivosParada ?? []).map((m: any) => ({
        motivo: m.motivo ?? 'Desconhecido',
        minutos: m.minutos ?? 0,
        horas: m.horas ?? 0,
        quantidade: m.quantidade ?? 0,
        percentual: m.percentual ?? 0
      })),
      grafico: (raw.kpiA?.grafico ?? []).map((g: any) => ({
        codigoBarras: g.codigoBarras ?? '',
        tipoLote: g.tipoLote ?? '',
        leadTimeHoras: g.leadTimeHoras ?? 0,
        downtimeHoras: g.downtimeHoras ?? 0,
        modelo: g.modelo ?? '',
        marca: g.marca ?? '',
        dataInicio: g.dataInicio ?? ''
      }))
    }

    kpiB.value = (raw.kpiB ?? []).map((b: any) => ({
      id: b.id ?? '',
      titulo: b.titulo ?? '',
      descricao: b.descricao ?? '',
      tipoOcorrencia: b.tipoOcorrencia ?? '',
      gravidade: b.gravidade ?? 'BAIXA',
      status: b.status ?? '',
      dataOcorrencia: b.dataOcorrencia ?? '',
      setor: b.setor ?? 'N/A',
      reportadoPor: b.reportadoPor ?? 'N/A',
      totalFotos: b.totalFotos ?? 0,
      fotos: b.fotos ?? []
    }))

    kpiC.value = {
      fpyGlobal: raw.kpiC?.fpyGlobal ?? null,
      totalInspecoes: raw.kpiC?.totalInspecoes ?? 0,
      setores: (raw.kpiC?.setores ?? []).map((s: any) => ({
        setor: s.setor ?? 'N/A',
        totalInspecoes: s.totalInspecoes ?? 0,
        totalRastreamentos: s.totalRastreamentos ?? 0,
        aprovadasPrimeira: s.aprovadasPrimeira ?? 0,
        fpyPercentual: s.fpyPercentual ?? 0
      }))
    }

    kpiD.value = {
      totalRetrabalhos: raw.kpiD?.totalRetrabalhos ?? 0,
      setores: (raw.kpiD?.setores ?? []).map((d: any) => ({
        setorOrigem: d.setorOrigem ?? 'N/A',
        totalRetrabalhos: d.totalRetrabalhos ?? 0,
        tempoMedioMin: d.tempoMedioMin ?? 0,
        tiposDivergencia: d.tiposDivergencia ?? '',
        percentualDoTotal: d.percentualDoTotal ?? 0
      }))
    }
  } catch (error) {
    console.error('[Dashboard] Erro ao buscar KPIs:', error)
  } finally {
    loading.value = false
  }
}

// ==========================================
// WEBSOCKET (PRESERVADO 100%)
// ==========================================
function initWebSocket() {
  const socketUrl = getApiOrigin()
  const token = localStorage.getItem('erp_token') || localStorage.getItem('token') || ''

  socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
    withCredentials: true,
    auth: { token }
  })

  socket.on('connect', () => { liveStatus.value = 'CONNECTED' })
  socket.on('disconnect', () => { liveStatus.value = 'DISCONNECTED' })
  socket.on('connect_error', (err: any) => {
    if (err?.message?.includes('token') || err?.message === 'TOKEN_EXPIRED') {
      liveStatus.value = 'DISCONNECTED'
      socket?.disconnect()
    }
  })

  const refreshEvents = [
    'peca:avanco', 'rastreamento:atualizado',
    'gargalo:update', 'ocorrencia:criada',
    'ocorrencia:atualizada', 'ocorrencia:resolvida'
  ]
  refreshEvents.forEach(evt => socket.on(evt, () => fetchKpis()))
}

// ==========================================
// GALERIA DE FOTOS (PRESERVADA 100%)
// ==========================================
function getFotoUrl(path: string) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base = getApiOrigin()
  return `${base}/${path.replace(/^\//, '')}`
}

function abrirGaleria(fotos: string[]) {
  if (!fotos?.length) return
  modalGaleriaFotos.value = fotos
  fotoIndexAtiva.value = 0
}

function fecharGaleria() {
  modalGaleriaFotos.value = null
  fotoIndexAtiva.value = 0
}

function fotoAnterior() {
  if (!modalGaleriaFotos.value) return
  fotoIndexAtiva.value = (fotoIndexAtiva.value - 1 + modalGaleriaFotos.value.length) % modalGaleriaFotos.value.length
}

function fotoProxima() {
  if (!modalGaleriaFotos.value) return
  fotoIndexAtiva.value = (fotoIndexAtiva.value + 1) % modalGaleriaFotos.value.length
}

// ==========================================
// FORMATAÇÃO (PRESERVADA 100%)
// ==========================================
function formatHour(val: number | null | undefined) {
  const n = val ?? 0
  if (n === 0 || isNaN(n)) return '0min'
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

function formatMin(totalMin: number) {
  if (!totalMin || totalMin <= 0) return '0min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ==========================================
// LIFECYCLE (PRESERVADO 100%)
// ==========================================
onMounted(() => {
  fetchKpis()
  initWebSocket()
})

onUnmounted(() => {
  socket?.disconnect()
})
</script>

<template>
  <div class="tc-root min-h-screen bg-slate-50/60 pb-20 text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
    <div class="max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

      <!-- ─── CABEÇALHO EXECUTIVO INDUSTRIAL (TELEMETRIA DE ALTO PADRÃO) ─── -->
      <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200/80 gap-5">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs ring-1 ring-slate-800 flex-shrink-0">
            <Layers :size="22" class="stroke-[2.2]" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">TORRE DE CONTROLE</span>
              <span class="text-slate-300">•</span>
              <span class="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold">TELEMETRIA INDUSTRIAL BI</span>
            </div>
            <h1 class="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 mt-0.5">
              Torre de Controle de Produção
            </h1>
            <p class="text-xs text-slate-500 font-medium tracking-tight mt-0.5">
              Telemetria gerencial em tempo real · Lead Time, Gargalos Operacionais, FPY e Retrabalho
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 self-end sm:self-center">
          <!-- LIVE SYNC STATUS BADGE COM PULSO SUAVE -->
          <div
            class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-tight transition-all duration-300 shadow-xs"
            :class="liveStatus === 'CONNECTED'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/90'
              : 'bg-slate-100 text-slate-500 border border-slate-200'"
          >
            <span v-if="liveStatus === 'CONNECTED'" class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span v-else class="w-2 h-2 rounded-full bg-slate-400"></span>

            <Wifi v-if="liveStatus === 'CONNECTED'" :size="13" class="stroke-[2.5]" />
            <WifiOff v-else :size="13" class="stroke-[2.5]" />
            <span>{{ liveStatus === 'CONNECTED' ? 'Live Sync Ativo' : 'Offline' }}</span>
          </div>

          <!-- BOTÃO ATUALIZAR -->
          <button
            class="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-bold font-mono tracking-tight shadow-xs transition-all active:scale-95 cursor-pointer"
            type="button"
            @click="fetchKpis"
            aria-label="Sincronizar KPIs"
          >
            <RefreshCw :size="13" class="stroke-[2.5]" />
            <span>Atualizar</span>
          </button>
        </div>
      </header>

      <!-- ─── SKELETON LOADING (BENTO WIREFRAME INDUSTRIAL) ───────────── -->
      <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
        <div class="lg:col-span-12 h-96 rounded-3xl bg-white border border-slate-200/80 p-6 flex flex-col justify-between">
          <div class="h-6 w-72 bg-slate-200 rounded-md"></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="h-28 bg-slate-100 rounded-2xl"></div>
            <div class="h-28 bg-slate-100 rounded-2xl"></div>
            <div class="h-28 bg-slate-100 rounded-2xl"></div>
            <div class="h-28 bg-slate-100 rounded-2xl"></div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div class="lg:col-span-5 h-32 bg-slate-100 rounded-2xl"></div>
            <div class="lg:col-span-7 h-32 bg-slate-100 rounded-2xl"></div>
          </div>
        </div>
        <div class="lg:col-span-7 h-96 rounded-3xl bg-white border border-slate-200/80 p-6">
          <div class="h-6 w-48 bg-slate-200 rounded-md mb-4"></div>
          <div class="space-y-3">
            <div class="h-20 bg-slate-100 rounded-2xl"></div>
            <div class="h-20 bg-slate-100 rounded-2xl"></div>
          </div>
        </div>
        <div class="lg:col-span-5 h-96 rounded-3xl bg-white border border-slate-200/80 p-6">
          <div class="h-6 w-48 bg-slate-200 rounded-md mb-4"></div>
          <div class="h-28 bg-slate-100 rounded-2xl mb-4"></div>
          <div class="space-y-2">
            <div class="h-8 bg-slate-100 rounded-xl"></div>
            <div class="h-8 bg-slate-100 rounded-xl"></div>
          </div>
        </div>
        <div class="lg:col-span-12 h-64 rounded-3xl bg-white border border-slate-200/80 p-6">
          <div class="h-6 w-60 bg-slate-200 rounded-md mb-4"></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="h-24 bg-slate-100 rounded-2xl"></div>
            <div class="h-24 bg-slate-100 rounded-2xl"></div>
            <div class="h-24 bg-slate-100 rounded-2xl"></div>
            <div class="h-24 bg-slate-100 rounded-2xl"></div>
          </div>
        </div>
      </div>

      <!-- ─── BENTO GRID DOS 4 KPIs DE NEGÓCIO ────────────────────────── -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- ══════════════════════════════════════════════════════════════ -->
        <!-- KPI A · LEAD TIME EFETIVO & DOWNTIME (Span 12)               -->
        <!-- ══════════════════════════════════════════════════════════════ -->
        <section class="lg:col-span-12 bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs hover:border-slate-300/80 transition-all duration-300 relative overflow-hidden">
          <!-- Header do Card -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-slate-100 gap-4">
            <div class="flex items-center gap-3.5">
              <div class="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/90 text-slate-800 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <Clock :size="20" class="stroke-[2.2]" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">KPI A · DESEMPENHO CRÍTICO</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold">CICLO & PARADAS</span>
                </div>
                <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                  Lead Time Efetivo & Downtime Acumulado
                </h2>
                <p class="text-xs text-slate-500 font-medium">
                  Tempo absoluto de permanência por lote e paradas operacionais que ativaram o SLA
                </p>
              </div>
            </div>

            <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] font-mono font-bold text-slate-700 self-start sm:self-center shadow-2xs">
              <Activity :size="13" class="text-blue-600 stroke-[2.5]" />
              <span>SLA Dinâmico Descontado</span>
            </div>
          </div>

          <!-- Quarteto de Métricas Numéricas de Alto Impacto -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-6">
            <!-- 1. Ordens Ativas (WIP) -->
            <div class="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 relative overflow-hidden transition-all duration-200 hover:bg-white hover:shadow-xs group border-l-4 border-l-slate-900">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block">WIP TOTAL (CHÃO DE FÁBRICA)</span>
                  <span class="text-[11px] text-slate-500 font-medium block mt-0.5">Ordens ativas em rota</span>
                </div>
                <span class="w-2.5 h-2.5 rounded-full bg-slate-900 ring-4 ring-slate-100"></span>
              </div>
              <div class="mt-4">
                <span class="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-slate-900 tabular-nums">
                  {{ kpiA.totalOrdensAtivas }}
                </span>
              </div>
              <span class="text-[11px] font-mono text-slate-400 font-medium block mt-1.5">
                Total de OPs em andamento
              </span>
            </div>

            <!-- 2. Caixa Teste (Piloto) -->
            <div class="bg-blue-50/20 border border-blue-100 rounded-2xl p-5 relative overflow-hidden transition-all duration-200 hover:bg-white hover:shadow-xs group border-l-4 border-l-blue-600">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold block">LEAD TIME · CAIXA TESTE</span>
                  <span class="text-[11px] text-slate-500 font-medium block mt-0.5">Ciclo piloto antecipado</span>
                </div>
                <span class="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50"></span>
              </div>
              <div class="mt-4">
                <span class="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-blue-600 tabular-nums">
                  {{ formatHour(kpiA.mediaCaixaTeste) }}
                </span>
              </div>
              <span class="text-[11px] font-mono text-slate-400 font-medium block mt-1.5">
                Média de ciclo da caixa piloto
              </span>
            </div>

            <!-- 3. Lote Principal (Volume) -->
            <div class="bg-indigo-50/20 border border-indigo-100 rounded-2xl p-5 relative overflow-hidden transition-all duration-200 hover:bg-white hover:shadow-xs group border-l-4 border-l-indigo-600">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] font-mono uppercase tracking-widest text-indigo-600 font-bold block">LEAD TIME · LOTE PRINCIPAL</span>
                  <span class="text-[11px] text-slate-500 font-medium block mt-0.5">Média de escala fabril</span>
                </div>
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-indigo-50"></span>
              </div>
              <div class="mt-4">
                <span class="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-indigo-600 tabular-nums">
                  {{ formatHour(kpiA.mediaLotePrincipal) }}
                </span>
              </div>
              <span class="text-[11px] font-mono text-slate-400 font-medium block mt-1.5">
                Ciclo fabril em escala de volume
              </span>
            </div>

            <!-- 4. Downtime Acumulado -->
            <div class="bg-rose-50/30 border border-rose-200/80 rounded-2xl p-5 relative overflow-hidden transition-all duration-200 hover:bg-rose-50/60 hover:shadow-xs group border-l-4 border-l-rose-500">
              <div class="flex justify-between items-start">
                <div>
                  <div class="flex items-center gap-1.5">
                    <PauseCircle :size="13" class="text-rose-600 stroke-[2.5]" />
                    <span class="text-[10px] font-mono uppercase tracking-widest text-rose-600 font-bold block">DOWNTIME TOTAL ACUMULADO</span>
                  </div>
                  <span class="text-[11px] text-rose-500/90 font-medium block mt-0.5">Paradas com pausa de SLA</span>
                </div>
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100" :class="{ 'animate-pulse': kpiA.downtimeTotalMin > 0 }"></span>
              </div>
              <div class="mt-4">
                <span class="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-rose-600 tabular-nums">
                  {{ kpiA.downtimeTotalHoras }}h
                </span>
              </div>
              <span class="text-[11px] font-mono text-rose-600 font-bold block mt-1.5">
                {{ kpiA.downtimeTotalMin }} min acumulados
              </span>
            </div>
          </div>

          <!-- Sub-grid: Motivos de Parada + Sparkline SVG -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 border-t border-slate-100">

            <!-- LADO ESQUERDO: Motivos Reais de Parada -->
            <div class="lg:col-span-5 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <Wrench :size="14" class="text-slate-600" />
                    <span class="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                      Motivos Reais de Parada (30 dias)
                    </span>
                  </div>
                  <span class="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
                    {{ kpiA.motivosParada.length }} {{ kpiA.motivosParada.length === 1 ? 'motivo' : 'motivos' }}
                  </span>
                </div>

                <div v-if="kpiA.motivosParada.length === 0" class="text-center py-10 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Check :size="18" class="stroke-[3]" />
                  </div>
                  <span class="text-[10px] font-mono uppercase tracking-widest text-emerald-700 font-bold">Fluxo Contínuo</span>
                  <p class="text-xs font-mono font-bold text-slate-700">
                    Sem paradas impeditivas no período.
                  </p>
                  <p class="text-[11px] text-slate-400 font-medium">
                    Nenhuma ocorrência ativou a pausa de SLA nas últimas ordens.
                  </p>
                </div>

                <div v-else class="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                  <div
                    v-for="item in kpiA.motivosParada"
                    :key="item.motivo"
                    class="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 hover:border-slate-300 hover:bg-white transition-all shadow-2xs"
                  >
                    <div class="flex justify-between items-start gap-2 mb-2">
                      <span class="text-xs font-bold text-slate-900 line-clamp-1">{{ item.motivo }}</span>
                      <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-[10px] font-mono font-bold bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded">
                          {{ item.quantidade }} ocorr.
                        </span>
                        <span class="text-xs font-mono font-bold text-slate-800 tabular-nums">
                          {{ formatMin(item.minutos) }}
                        </span>
                        <span class="text-xs font-mono font-black text-rose-600 tabular-nums">
                          {{ item.percentual }}%
                        </span>
                      </div>
                    </div>
                    <!-- Barra de progresso industrial -->
                    <div class="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500"
                        :style="{ width: `${Math.min(100, item.percentual)}%` }"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- LADO DIREITO: Sparkline da Curva de Lead Time -->
            <div class="lg:col-span-7 flex flex-col justify-between bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <Activity :size="14" class="text-slate-600" />
                  <span class="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                    Variação do Lead Time (Últimas Ordens)
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                    <span class="w-2 h-2 rounded-full bg-slate-900 inline-block"></span>
                    Lead Time (Horas)
                  </span>
                </div>
              </div>

              <!-- Gráfico SVG Vetorial de Alta Fidelidade -->
              <div class="w-full h-44 sm:h-52 flex items-center justify-center my-1 relative">
                <svg viewBox="0 0 520 120" class="w-full h-full overflow-visible" aria-hidden="true">
                  <defs>
                    <linearGradient id="tc-lead-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.18" />
                      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.0" />
                    </linearGradient>
                  </defs>

                  <!-- Linhas Guia Sutis -->
                  <line x1="0" y1="20" x2="520" y2="20" stroke="#e2e8f0" stroke-dasharray="4 4" stroke-width="1" />
                  <line x1="0" y1="60" x2="520" y2="60" stroke="#e2e8f0" stroke-dasharray="4 4" stroke-width="1" />
                  <line x1="0" y1="100" x2="520" y2="100" stroke="#cbd5e1" stroke-width="1" />

                  <!-- Área Sombreada -->
                  <path
                    v-if="kpiA.grafico.length > 1"
                    fill="url(#tc-lead-grad)"
                    :d="(() => {
                      const g = kpiA.grafico
                      const maxV = Math.max(...g.map(x => x.leadTimeHoras), 1)
                      const pts = g.map((item, i) => {
                        const x = (i / Math.max(1, g.length - 1)) * 520
                        const y = 100 - (item.leadTimeHoras / maxV) * 80
                        return `${x.toFixed(1)},${y.toFixed(1)}`
                      })
                      const first = pts[0].split(',')
                      const last = pts[pts.length - 1].split(',')
                      return `M ${pts.join(' L ')} L ${last[0]},100 L ${first[0]},100 Z`
                    })()"
                  />

                  <!-- Linha Principal Contínua -->
                  <path
                    v-if="kpiA.grafico.length > 1"
                    fill="none"
                    stroke="#0f172a"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :d="kpiA.grafico
                      .map((item, i) => {
                        const maxV = Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)
                        const x = (i / Math.max(1, kpiA.grafico.length - 1)) * 520
                        const y = 100 - (item.leadTimeHoras / maxV) * 80
                        return `${x.toFixed(1)},${y.toFixed(1)}`
                      })
                      .reduce((acc, curr, idx) => idx === 0 ? `M ${curr}` : `${acc} L ${curr}`, '')"
                  />

                  <!-- Nós de Dados Interativos com Tooltip -->
                  <circle
                    v-for="(item, i) in kpiA.grafico"
                    :key="i"
                    :cx="(i / Math.max(1, kpiA.grafico.length - 1)) * 520"
                    :cy="100 - (item.leadTimeHoras / Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)) * 80"
                    r="4.5"
                    fill="#ffffff"
                    stroke="#0f172a"
                    stroke-width="2.5"
                    class="transition-transform duration-150 hover:scale-150 cursor-pointer"
                  >
                    <title>{{ item.tipoLote }} - {{ item.modelo }}: {{ item.leadTimeHoras }}h</title>
                  </circle>
                </svg>

                <div v-if="kpiA.grafico.length <= 1" class="absolute inset-0 flex items-center justify-center">
                  <span class="text-xs font-mono text-slate-400">Dados históricos insuficientes para curva temporal.</span>
                </div>
              </div>

              <!-- Legenda Temporal Inferior -->
              <div class="flex justify-between items-center text-[10px] font-mono text-slate-400 border-t border-slate-200/60 pt-2 font-bold uppercase tracking-wider">
                <span>← Lotes Recentes</span>
                <span class="text-slate-300">|</span>
                <span>Lotes Anteriores →</span>
              </div>
            </div>

          </div>
        </section>

        <!-- ══════════════════════════════════════════════════════════════ -->
        <!-- KPI B · GARGALOS OPERACIONAIS (Span 7)                       -->
        <!-- ══════════════════════════════════════════════════════════════ -->
        <section class="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs hover:border-slate-300/80 transition-all duration-300 flex flex-col justify-between">
          <div>
            <!-- Header do Card -->
            <div class="flex items-start justify-between pb-5 mb-5 border-b border-slate-100 gap-3">
              <div class="flex items-center gap-3.5">
                <div class="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <AlertTriangle :size="20" class="stroke-[2.2]" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">KPI B · CONTROLE DE DESVIOS</span>
                  </div>
                  <h2 class="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    Gargalos Operacionais
                  </h2>
                  <p class="text-xs text-slate-500 font-medium">
                    Ocorrências ativas em aberto ou em análise no chão de fábrica
                  </p>
                </div>
              </div>

              <!-- Badge Contador de Gargalos -->
              <span
                class="font-mono text-xs font-black px-3 py-1 rounded-full border tracking-tight flex-shrink-0 shadow-2xs"
                :class="kpiB.length > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'"
              >
                {{ kpiB.length }} {{ kpiB.length === 1 ? 'ativo' : 'ativos' }}
              </span>
            </div>

            <!-- Lista de Gargalos -->
            <div class="space-y-3 max-h-[440px] overflow-y-auto pr-1">
              <!-- Empty State (Padrão Caminho Livre) -->
              <div v-if="kpiB.length === 0" class="text-center py-12 px-4 bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Check :size="20" class="stroke-[3]" />
                </div>
                <span class="text-[10px] font-mono uppercase tracking-widest text-emerald-700 font-bold">Fluxo Desimpedido</span>
                <p class="text-xs font-mono font-bold text-slate-700">
                  Zero gargalos ativos no momento.
                </p>
                <p class="text-[11px] text-slate-400 font-medium">
                  Produção fluindo normalmente em todas as células de modelagem e corte.
                </p>
              </div>

              <!-- Item da Lista de Gargalos -->
              <div
                v-else
                v-for="oc in kpiB"
                :key="oc.id"
                class="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4.5 flex items-start justify-between gap-4 transition-all duration-200 hover:bg-white hover:shadow-xs hover:border-slate-300"
                :class="{
                  'border-l-4 border-l-rose-500 bg-rose-50/10': oc.gravidade === 'CRITICA',
                  'border-l-4 border-l-orange-500 bg-orange-50/10': oc.gravidade === 'ALTA',
                  'border-l-4 border-l-amber-500 bg-amber-50/10': oc.gravidade === 'MEDIA',
                  'border-l-4 border-l-slate-400': oc.gravidade === 'BAIXA'
                }"
              >
                <div class="flex-1 min-w-0">
                  <!-- Meta row -->
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      class="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded border"
                      :class="{
                        'bg-rose-50 text-rose-700 border-rose-200': oc.gravidade === 'CRITICA',
                        'bg-orange-50 text-orange-700 border-orange-200': oc.gravidade === 'ALTA',
                        'bg-amber-50 text-amber-700 border-amber-200': oc.gravidade === 'MEDIA',
                        'bg-slate-100 text-slate-600 border-slate-200': oc.gravidade === 'BAIXA'
                      }"
                    >
                      {{ oc.gravidade }}
                    </span>
                    <span class="text-xs font-mono font-bold text-slate-800 uppercase tracking-wide">
                      {{ oc.setor }}
                    </span>
                    <span class="text-[11px] font-mono text-slate-400 ml-auto font-medium">
                      {{ formatDate(oc.dataOcorrencia) }}
                    </span>
                  </div>

                  <!-- Título & Descrição -->
                  <h3 class="text-sm font-bold text-slate-900 tracking-tight truncate mb-1">
                    {{ oc.titulo }}
                  </h3>
                  <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2 font-normal">
                    {{ oc.descricao }}
                  </p>

                  <!-- Reporter -->
                  <p class="text-[11px] font-mono text-slate-400">
                    Registrado por: <strong class="text-slate-700 font-semibold">{{ oc.reportadoPor }}</strong>
                  </p>
                </div>

                <!-- Botão Tátil de 48px para Fotos -->
                <button
                  v-if="oc.fotos && oc.fotos.length > 0"
                  type="button"
                  class="w-12 h-12 flex-shrink-0 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white flex flex-col items-center justify-center gap-0.5 shadow-xs transition-all active:scale-95 cursor-pointer group"
                  @click="abrirGaleria(oc.fotos)"
                  :aria-label="`Ver ${oc.fotos.length} fotos da ocorrência`"
                  :title="`Visualizar ${oc.fotos.length} registros fotográficos do desvio`"
                >
                  <ImageIcon :size="17" class="group-hover:scale-110 transition-transform" />
                  <span class="text-[10px] font-mono font-black tabular-nums">{{ oc.fotos.length }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ══════════════════════════════════════════════════════════════ -->
        <!-- KPI C · FIRST PASS YIELD (FPY) (Span 5)                      -->
        <!-- ══════════════════════════════════════════════════════════════ -->
        <section class="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs hover:border-slate-300/80 transition-all duration-300 flex flex-col justify-between">
          <div>
            <!-- Header do Card -->
            <div class="flex items-start justify-between pb-5 mb-5 border-b border-slate-100 gap-3">
              <div class="flex items-center gap-3.5">
                <div class="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200/90 text-emerald-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <ShieldCheck :size="20" class="stroke-[2.2]" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">KPI C · QUALIDADE FABRIL</span>
                  </div>
                  <h2 class="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    First Pass Yield (FPY)
                  </h2>
                  <p class="text-xs text-slate-500 font-medium">
                    Aprovação na primeira passagem de inspeção
                  </p>
                </div>
              </div>

              <div class="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-400 flex items-center justify-center flex-shrink-0">
                <TrendingUp :size="16" class="stroke-[2.2]" />
              </div>
            </div>

            <!-- Spotlight: FPY Global -->
            <div class="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 mb-5 flex items-center justify-between shadow-2xs">
              <div>
                <span class="text-4xl sm:text-5xl font-black font-mono tracking-tighter tabular-nums block"
                  :class="kpiC.fpyGlobal == null ? 'text-slate-400' : kpiC.fpyGlobal >= 90 ? 'text-emerald-700' : 'text-rose-600'"
                >
                  {{ kpiC.fpyGlobal == null ? '—' : `${kpiC.fpyGlobal}%` }}
                </span>
                <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold mt-1 block">
                  {{ kpiC.totalInspecoes }} inspeções consideradas
                </span>
              </div>

              <!-- Pill de Meta -->
              <span
                class="font-mono text-xs font-bold px-3.5 py-1.5 rounded-full border tracking-tight flex items-center gap-1.5 shadow-2xs"
                :class="kpiC.fpyGlobal == null
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : kpiC.fpyGlobal >= 90
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'"
              >
                <Check v-if="kpiC.fpyGlobal != null && kpiC.fpyGlobal >= 90" :size="13" class="stroke-[3]" />
                <Activity v-else-if="kpiC.fpyGlobal == null" :size="13" class="stroke-[2.5]" />
                <AlertTriangle v-else :size="13" class="stroke-[2.5]" />
                <span>{{ kpiC.fpyGlobal == null ? 'Sem dados' : kpiC.fpyGlobal >= 90 ? 'Meta ≥90%' : 'Abaixo da Meta' }}</span>
              </span>
            </div>

            <!-- Lista de Setores -->
            <div class="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              <div v-if="kpiC.setores.length === 0" class="text-center py-8 px-4 bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl">
                <p class="text-xs font-mono font-medium text-slate-500">
                  Sem inspeções de saída registradas.
                </p>
              </div>

              <div
                v-else
                v-for="item in kpiC.setores"
                :key="item.setor"
                class="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3.5 hover:bg-white hover:border-slate-300 transition-all shadow-2xs"
              >
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-xs font-bold text-slate-900 uppercase tracking-wide">{{ item.setor }}</span>
                  <span
                    class="text-xs font-mono font-black tabular-nums"
                    :class="item.fpyPercentual >= 90 ? 'text-emerald-700' : 'text-rose-600'"
                  >
                    {{ item.fpyPercentual }}%
                  </span>
                </div>

                <!-- Barra de Progresso FPY -->
                <div class="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-700"
                    :class="item.fpyPercentual >= 90 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-amber-500 to-rose-500'"
                    :style="{ width: `${Math.min(100, item.fpyPercentual)}%` }"
                  ></div>
                </div>

                <p class="text-[10px] font-mono text-slate-400 mt-1.5 font-medium">
                  {{ item.aprovadasPrimeira }} aprovadas de {{ item.totalInspecoes > 0 ? item.totalInspecoes : item.totalRastreamentos }} inspecionadas
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- ══════════════════════════════════════════════════════════════ -->
        <!-- KPI D · RETRABALHO POR ORIGEM (Span 12)                      -->
        <!-- ══════════════════════════════════════════════════════════════ -->
        <section class="lg:col-span-12 bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs hover:border-slate-300/80 transition-all duration-300">
          <!-- Header do Card -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-slate-100 gap-4">
            <div class="flex items-center gap-3.5">
              <div class="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200/90 text-orange-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <RotateCcw :size="20" class="stroke-[2.2]" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">KPI D · REINCIDÊNCIA & RETORNO CIRÚRGICO</span>
                </div>
                <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                  Índice de Retrabalho por Setor de Origem
                </h2>
                <p class="text-xs text-slate-500 font-medium">
                  Mapeamento dos setores que geraram maior volume de reprocessamento (últimos 30 dias)
                </p>
              </div>
            </div>

            <!-- Totalizador Geral de Retrabalhos -->
            <div class="flex items-baseline gap-2 self-start sm:self-center bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-2 shadow-2xs">
              <span class="text-2xl sm:text-3xl font-black font-mono tracking-tighter text-slate-900 tabular-nums">
                {{ kpiD.totalRetrabalhos }}
              </span>
              <span class="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                casos totais
              </span>
            </div>
          </div>

          <!-- Empty State (Padrão Caminho Livre) -->
          <div v-if="kpiD.setores.length === 0" class="text-center py-12 px-4 bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
            <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Check :size="20" class="stroke-[3]" />
            </div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-emerald-700 font-bold">Conformidade Plena</span>
            <p class="text-xs font-mono font-bold text-slate-700">
              Nenhum retrabalho apontado nos últimos 30 dias.
            </p>
            <p class="text-[11px] text-slate-400 font-medium">
              Zero reincidência de peças com retorno cirúrgico.
            </p>
          </div>

          <!-- Grid de Cards de Retrabalho por Setor -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
            <div
              v-for="item in kpiD.setores"
              :key="item.setorOrigem"
              class="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 border-l-4 border-l-orange-500 hover:bg-white hover:shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div class="flex justify-between items-start gap-2 mb-2">
                  <span class="text-sm font-black text-slate-900 uppercase tracking-tight truncate">
                    {{ item.setorOrigem }}
                  </span>
                  <span class="text-xs font-mono font-black text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums">
                    {{ item.totalRetrabalhos }} {{ item.totalRetrabalhos === 1 ? 'caso' : 'casos' }}
                  </span>
                </div>

                <!-- Barra de Participação -->
                <div class="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden mt-3 mb-2">
                  <div
                    class="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700"
                    :style="{ width: `${Math.min(100, item.percentualDoTotal)}%` }"
                  ></div>
                </div>

                <!-- Footer com Métricas -->
                <div class="flex justify-between items-center text-[11px] font-mono text-slate-500 mt-2 font-medium">
                  <span class="font-bold text-slate-700">{{ item.percentualDoTotal }}% do total</span>
                  <span>Média: {{ item.tempoMedioMin }} min</span>
                </div>
              </div>

              <!-- Divergências Observadas -->
              <div v-if="item.tiposDivergencia" class="mt-3.5 pt-2.5 border-t border-slate-200/70">
                <span class="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5 font-bold">Divergências:</span>
                <p class="text-xs text-slate-600 line-clamp-1 italic font-normal" :title="item.tiposDivergencia">
                  {{ item.tiposDivergencia }}
                </p>
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- ══════════════════════════════════════════════════════════════ -->
      <!-- MODAL · GALERIA DE FOTOS DO DESVIO (PADRÃO DARKROOM/STUDIO)    -->
      <!-- ══════════════════════════════════════════════════════════════ -->
      <Transition name="tc-modal-fade">
        <div
          v-if="modalGaleriaFotos"
          class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          @click.self="fecharGaleria"
        >
          <div class="bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col animate-scale-in">
            <!-- Header do Modal -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center">
                  <ImageIcon :size="16" />
                </div>
                <div>
                  <h3 class="text-sm font-mono font-bold text-white">
                    Registro de Não Conformidade
                  </h3>
                  <span class="text-[11px] font-mono text-slate-400">
                    Foto {{ fotoIndexAtiva + 1 }} de {{ modalGaleriaFotos.length }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                @click="fecharGaleria"
                aria-label="Fechar galeria"
              >
                <X :size="16" class="stroke-[2.5]" />
              </button>
            </div>

            <!-- Área Central da Foto (Darkroom Matte Black) -->
            <div class="relative bg-black flex items-center justify-center min-h-[340px] max-h-[62vh] select-none overflow-hidden p-2">
              <img
                :src="getFotoUrl(modalGaleriaFotos[fotoIndexAtiva])"
                alt="Foto do desvio de qualidade"
                class="max-w-full max-h-[60vh] object-contain block rounded-lg transition-opacity duration-200 shadow-xl"
              />

              <!-- Botões de Navegação Anterior/Próxima -->
              <button
                v-if="modalGaleriaFotos.length > 1"
                type="button"
                class="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-lg backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                @click="fotoAnterior"
                aria-label="Foto anterior"
              >
                <ChevronLeft :size="22" class="stroke-[2.5]" />
              </button>
              <button
                v-if="modalGaleriaFotos.length > 1"
                type="button"
                class="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-lg backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                @click="fotoProxima"
                aria-label="Próxima foto"
              >
                <ChevronRight :size="22" class="stroke-[2.5]" />
              </button>
            </div>

            <!-- Barra de Miniaturas (Thumbnails) -->
            <div v-if="modalGaleriaFotos.length > 1" class="flex gap-2 p-3.5 bg-slate-900 border-t border-slate-800 overflow-x-auto justify-center">
              <button
                v-for="(foto, i) in modalGaleriaFotos"
                :key="i"
                type="button"
                class="w-12 h-12 rounded-xl overflow-hidden cursor-pointer transition-all border-2 flex-shrink-0"
                :class="fotoIndexAtiva === i ? 'border-white ring-2 ring-white/20 scale-105 opacity-100' : 'border-transparent opacity-50 hover:opacity-100'"
                @click="fotoIndexAtiva = i"
              >
                <img :src="getFotoUrl(foto)" alt="Miniatura" class="w-full h-full object-cover" />
              </button>
            </div>

            <!-- Footer do Modal -->
            <div class="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/90">
              <span class="text-[11px] font-mono text-slate-400">
                Evidência vinculada à Ordem de Produção
              </span>
              <button
                type="button"
                class="px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 text-xs font-mono font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
                @click="fecharGaleria"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      </Transition>

    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   MICRO-ANIMAÇÕES & TRANSIÇÕES DO MODAL
═══════════════════════════════════════════════════════════ */
.tc-modal-fade-enter-active,
.tc-modal-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tc-modal-fade-enter-from,
.tc-modal-fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Custom Scrollbar Industrial Fino */
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
