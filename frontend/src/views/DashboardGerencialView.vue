<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api, { getApiOrigin, getApiSocketPath } from '../api/axios'
import DashboardGerencialMetrics from '../components/DashboardGerencialMetrics.vue'
import type { DashboardFilterOptions, FpySetor, GargaloItem, KpiAData, KpiCData, KpiDData, RetrabalhoSetor } from '../types/dashboardGerencial'
import {
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Layers
} from '@lucide/vue'

// ==========================================
// ESTADO REATIVO (PRESERVADO 100%)
// ==========================================
const loading = ref(true)
const fetchError = ref(false)
const hasSuccessfulFetch = ref(false)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

const filtros = ref({
  plantaId: '',
  setorId: '',
  dataInicio: '',
  dataFim: ''
})
const opcoesFiltro = ref<DashboardFilterOptions>({
  acessoTodasPlantas: false,
  plantaId: null,
  plantas: [],
  setores: []
})
const setoresDisponiveis = computed(() => opcoesFiltro.value.setores.filter(
  setor => !filtros.value.plantaId || setor.plantaId === filtros.value.plantaId
))
const periodoInvalido = computed(() => Boolean(
  filtros.value.dataInicio && filtros.value.dataFim && filtros.value.dataInicio > filtros.value.dataFim
))

const kpiA = ref<KpiAData>({
  totalOrdensAtivas: 0,
  mediaCaixaTeste: 0,
  mediaLotePrincipal: 0,
  grafico: []
})

const kpiB = ref<GargaloItem[]>([])

const kpiC = ref<KpiCData>({
  fpyGlobal: null,
  totalInspecoes: 0,
  setores: []
})

const kpiD = ref<KpiDData>({
  totalRetrabalhos: 0,
  setores: []
})

// Modal Galeria de Fotos
const modalGaleriaFotos = ref<string[] | null>(null)
const fotoIndexAtiva = ref(0)

// ==========================================
// BUSCA DE DADOS (PRESERVADA 100%)
// ==========================================
async function fetchFilterOptions() {
  try {
    const res = await api.get('/dashboard/filters')
    opcoesFiltro.value = {
      acessoTodasPlantas: res.data.acessoTodasPlantas === true,
      plantaId: res.data.plantaId ?? null,
      plantas: (res.data.plantas ?? []).map((planta: any) => ({
        id: planta.id ?? '',
        nome: planta.nome ?? 'Planta sem nome',
        ativo: planta.ativo !== false
      })),
      setores: (res.data.setores ?? []).map((setor: any) => ({
        id: setor.id ?? '',
        nome: setor.nome ?? 'Setor sem nome',
        plantaId: setor.plantaId ?? '',
        planta: setor.planta ?? 'Planta não informada',
        ativo: setor.ativo !== false
      }))
    }
  } catch (error) {
    console.error('[Dashboard] Erro ao carregar opções de filtro:', error)
  }
}

async function fetchKpis() {
  if (periodoInvalido.value) return
  fetchError.value = false
  if (!hasSuccessfulFetch.value) loading.value = true

  try {
    const params: Record<string, string> = {}
    if (opcoesFiltro.value.acessoTodasPlantas && filtros.value.plantaId) params.plantaId = filtros.value.plantaId
    if (filtros.value.setorId) params.setorId = filtros.value.setorId
    if (filtros.value.dataInicio) params.dataInicio = filtros.value.dataInicio
    if (filtros.value.dataFim) params.dataFim = filtros.value.dataFim

    const res = await api.get('/dashboard/kpis', { params })
    const raw = res.data

    kpiA.value = {
      totalOrdensAtivas: raw.kpiA?.totalOrdensAtivas ?? 0,
      mediaCaixaTeste: raw.kpiA?.mediaCaixaTeste ?? 0,
      mediaLotePrincipal: raw.kpiA?.mediaLotePrincipal ?? 0,
      grafico: (raw.kpiA?.grafico ?? []).map((g: any) => ({
        codigoBarras: g.codigoBarras ?? '',
        tipoLote: g.tipoLote ?? '',
        leadTimeHoras: g.leadTimeHoras ?? 0,
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
      setorId: b.setorId ?? '',
      setor: b.setor ?? 'N/A',
      plantaId: b.plantaId ?? null,
      planta: b.planta ?? 'N/A',
      reportadoPor: b.reportadoPor ?? 'N/A',
      totalFotos: b.totalFotos ?? 0,
      fotos: b.fotos ?? []
    }))

    kpiC.value = {
      fpyGlobal: raw.kpiC?.fpyGlobal ?? null,
      totalInspecoes: raw.kpiC?.totalInspecoes ?? 0,
      setores: (raw.kpiC?.setores ?? []).map((s: any): FpySetor => ({
        setorId: s.setorId ?? '',
        setor: s.setor ?? 'N/A',
        plantaId: s.plantaId ?? '',
        planta: s.planta ?? 'N/A',
        totalInspecoes: s.totalInspecoes ?? 0,
        aprovadasPrimeira: s.aprovadasPrimeira ?? 0,
        fpyPercentual: s.fpyPercentual ?? 0
      }))
    }

    kpiD.value = {
      totalRetrabalhos: raw.kpiD?.totalRetrabalhos ?? 0,
      setores: (raw.kpiD?.setores ?? []).map((d: any): RetrabalhoSetor => ({
        setorId: d.setorId ?? '',
        setorOrigem: d.setorOrigem ?? 'N/A',
        plantaId: d.plantaId ?? '',
        planta: d.planta ?? 'N/A',
        totalRetrabalhos: d.totalRetrabalhos ?? 0,
        tempoMedioMin: d.tempoMedioMin == null ? null : Number(d.tempoMedioMin),
        tiposDivergencia: d.tiposDivergencia ?? '',
        percentualDoTotal: d.percentualDoTotal ?? 0
      }))
    }
    hasSuccessfulFetch.value = true
  } catch (error) {
    fetchError.value = true
    console.error('[Dashboard] Erro ao buscar KPIs:', error)
  } finally {
    loading.value = false
  }
}

function atualizarSetorSelecionado() {
  if (filtros.value.setorId && !setoresDisponiveis.value.some(setor => setor.id === filtros.value.setorId)) {
    filtros.value.setorId = ''
  }
}

function limparFiltros() {
  filtros.value = { plantaId: '', setorId: '', dataInicio: '', dataFim: '' }
  fetchKpis()
}

// ==========================================
// WEBSOCKET (PRESERVADO 100%)
// ==========================================
function initWebSocket() {
  const socketUrl = getApiOrigin()
  const token = localStorage.getItem('erp_token') || localStorage.getItem('token') || ''

  socket = io(socketUrl, {
    path: getApiSocketPath(),
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
    'ocorrencia:atualizada', 'ocorrencia:resolvida',
    'dashboard:update'
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

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ==========================================
// LIFECYCLE (PRESERVADO 100%)
// ==========================================
onMounted(async () => {
  await fetchFilterOptions()
  await fetchKpis()
  initWebSocket()
})

onUnmounted(() => {
  socket?.disconnect()
})
</script>

<template>
  <div class="tc-root min-h-full w-full bg-[#F8FAFC] pb-8 text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
    <div class="mx-auto w-full max-w-[1780px] space-y-5 px-4 py-4 sm:px-6 sm:py-5">

      <!-- Cabeçalho executivo -->
      <header class="flex flex-col gap-5 border-b border-[#E2E8F0] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Layers :size="21" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-2xl font-bold tracking-tight text-slate-900">
                Torre de Controle de Produção
              </h1>
              <span class="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
                Telemetria de Ciclo &amp; SLA
              </span>
            </div>
            <p class="mt-0.5 text-sm text-slate-500">
              Lead Time, Saúde Operacional, qualidade fabril e retrabalho
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 self-end sm:self-auto">
          <div
            class="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold transition-colors"
            :class="liveStatus === 'CONNECTED'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-500'"
          >
            <span class="h-2 w-2 rounded-full" :class="liveStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-slate-400'"></span>
            <Wifi v-if="liveStatus === 'CONNECTED'" :size="13" />
            <WifiOff v-else :size="13" />
            <span>{{ liveStatus === 'CONNECTED' ? 'Live Sync Ativo' : 'Offline' }}</span>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            @click="fetchKpis"
            :disabled="loading"
            aria-label="Atualizar indicadores"
          >
            <RefreshCw :size="13" :class="{ 'animate-spin': loading }" />
            <span>Atualizar</span>
          </button>
        </div>
      </header>

      <section class="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]" aria-label="Filtros da Torre de Controle">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label v-if="opcoesFiltro.acessoTodasPlantas" class="flex flex-col gap-1.5 text-[10px] font-semibold text-slate-600">
            Planta
            <select v-model="filtros.plantaId" class="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" @change="atualizarSetorSelecionado">
              <option value="">Todas as plantas</option>
              <option v-for="planta in opcoesFiltro.plantas" :key="planta.id" :value="planta.id">
                {{ planta.nome }}{{ planta.ativo ? '' : ' (inativa)' }}
              </option>
            </select>
          </label>
          <div v-else class="flex h-10 flex-col justify-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-[10px] text-slate-500">
            <span class="font-semibold">Escopo da planta</span>
            <span>{{ opcoesFiltro.plantas[0]?.nome ?? 'Planta do usuário' }}</span>
          </div>

          <label class="flex flex-col gap-1.5 text-[10px] font-semibold text-slate-600">
            Setor
            <select v-model="filtros.setorId" class="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <option value="">Todos os setores</option>
              <option v-for="setor in setoresDisponiveis" :key="setor.id" :value="setor.id">
                {{ setor.nome }}{{ opcoesFiltro.acessoTodasPlantas && !filtros.plantaId ? ` — ${setor.planta}` : '' }}{{ setor.ativo ? '' : ' (inativo)' }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5 text-[10px] font-semibold text-slate-600">
            Data inicial
            <input v-model="filtros.dataInicio" type="date" class="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
          </label>
          <label class="flex flex-col gap-1.5 text-[10px] font-semibold text-slate-600">
            Data final
            <input v-model="filtros.dataFim" type="date" class="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
          </label>

          <div class="flex gap-2">
            <button
              type="button"
              class="h-10 flex-1 rounded-lg bg-slate-900 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="periodoInvalido || loading"
              @click="fetchKpis"
            >Aplicar filtros</button>
            <button
              type="button"
              class="h-10 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              :disabled="loading"
              @click="limparFiltros"
            >Limpar</button>
          </div>
        </div>
        <p v-if="periodoInvalido" class="mt-2 text-[10px] font-medium text-rose-600">A data inicial deve ser anterior ou igual à data final.</p>
        <p v-else class="mt-2 text-[10px] text-slate-400">Datas inclusivas: início da ordem, ocorrência, inspeção ou início/criação do retrabalho. O setor limita cada registro; no Lead Time, seleciona ordens cuja rota inclui o setor. WIP e ocorrências mostram status atual.</p>
      </section>

      <!-- Erro de comunicação -->
      <div
        v-if="fetchError"
        role="alert"
        class="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p class="text-xs font-semibold text-rose-800">
            {{ hasSuccessfulFetch ? 'Falha ao atualizar os indicadores.' : 'Não foi possível carregar os indicadores.' }}
          </p>
          <p class="mt-0.5 text-[11px] text-rose-700">
            {{ hasSuccessfulFetch ? 'Os últimos dados carregados continuam visíveis.' : 'Verifique a conexão e tente novamente.' }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
          @click="fetchKpis"
          :disabled="loading"
        >
          <RefreshCw :size="13" :class="{ 'animate-spin': loading }" />
          Tentar novamente
        </button>
      </div>

      <!-- Skeleton alinhado à arquitetura 3 / 8-4 / 5-7 -->
      <div v-if="loading" class="grid grid-cols-1 gap-5 animate-pulse sm:grid-cols-2 lg:grid-cols-12" aria-label="Carregando indicadores">
        <div v-for="item in 3" :key="'kpi-' + item" class="h-[210px] rounded-xl border border-slate-200/80 bg-white p-5 sm:col-span-1 lg:col-span-4">
          <div class="h-3 w-24 rounded bg-slate-200"></div>
          <div class="mt-6 h-8 w-28 rounded bg-slate-200"></div>
          <div class="mt-5 h-2 w-full rounded bg-slate-100"></div>
        </div>
        <div class="h-96 rounded-xl border border-slate-200/80 bg-white p-5 sm:col-span-2 lg:col-span-8">
          <div class="h-4 w-48 rounded bg-slate-200"></div>
          <div class="mt-7 h-48 rounded-xl bg-slate-100"></div>
        </div>
        <div class="h-96 rounded-xl border border-slate-200/80 bg-white p-5 sm:col-span-2 lg:col-span-4">
          <div class="h-4 w-40 rounded bg-slate-200"></div>
          <div class="mt-5 h-20 rounded-lg bg-slate-100"></div>
          <div class="mt-4 h-20 rounded-lg bg-slate-100"></div>
        </div>
        <div class="h-80 rounded-xl border border-slate-200/80 bg-white p-5 sm:col-span-1 lg:col-span-5">
          <div class="h-4 w-40 rounded bg-slate-200"></div>
          <div class="mx-auto mt-7 h-28 w-44 rounded-t-full bg-slate-100"></div>
          <div class="mt-5 h-2 rounded bg-slate-100"></div>
        </div>
        <div class="h-80 rounded-xl border border-slate-200/80 bg-white p-5 sm:col-span-1 lg:col-span-7">
          <div class="h-4 w-56 rounded bg-slate-200"></div>
          <div class="mt-6 space-y-5">
            <div class="h-7 rounded bg-slate-100"></div>
            <div class="h-7 rounded bg-slate-100"></div>
            <div class="h-7 rounded bg-slate-100"></div>
          </div>
        </div>
      </div>

      <DashboardGerencialMetrics
        v-else-if="hasSuccessfulFetch"
        :kpi-a="kpiA"
        :kpi-b="kpiB"
        :kpi-c="kpiC"
        :kpi-d="kpiD"
        :format-hour="formatHour"
        :format-date="formatDate"
        @abrir-galeria="abrirGaleria"
      />

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
                  <h3 class="text-sm font-bold text-white">
                    Registro de Não Conformidade
                  </h3>
                  <span class="text-[11px] tabular-nums text-slate-400">
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
              <span class="text-[11px] text-slate-400">
                Evidência vinculada à Ordem de Produção
              </span>
              <button
                type="button"
                class="px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
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
