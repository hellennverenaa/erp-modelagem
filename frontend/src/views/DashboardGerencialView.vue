<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api from '../api/axios'
import {
  Clock,
  AlertTriangle,
  TrendingUp,
  RotateCcw,
  Activity,
  Eye
} from '@lucide/vue'

// ==========================================
// ESTADOS E DECLARAÇÕES
// ==========================================
interface LeadTimeItem {
  codigoBarras: string
  tipoLote: string
  leadTimeHoras: number
  modelo: string
  marca: string
  dataInicio: string
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

interface TimelineStep {
  id: string
  label: string
  valores: string[]
}

const steps: TimelineStep[] = [
  { id: 'almoxarifado', label: 'Almoxarifado', valores: ['ALMOXARIFADO'] },
  { id: 'navalha', label: 'Navalha', valores: ['NAVALHA'] },
  { id: 'telas', label: 'Telas', valores: ['TELAS'] },
  { id: 'corte', label: 'Corte', valores: ['RECEBIMENTO_CORTE', 'SEPARACAO_CORTE', 'DUBLAGEM_CORTE', 'CORTE_PONTE', 'CORTE_LECTRA', 'CORTE_ATOM', 'CORTE_CN', 'CORTE_COURO', 'CORTE_LASER'] },
  { id: 'serigrafia_bordado', label: 'Serigrafia/Bordado', valores: ['SERIGRAFIA', 'BORDADO'] },
  { id: 'apoio', label: 'Apoio', valores: ['APOIO'] },
  { id: 'costura', label: 'Costura', valores: ['COSTURA_PROGRAMADA', 'COSTURA'] },
  { id: 'pre_fabricado', label: 'Pré-Fabricado', valores: ['PRE_FABRICADO'] },
  { id: 'montagem', label: 'Montagem', valores: ['MONTAGEM'] },
  { id: 'vulcanizado', label: 'Vulcanizado', valores: ['VULCANIZADO'] },
  { id: 'laboratorio', label: 'Laboratório', valores: ['LABORATORIO'] }
]

const loading = ref(true)
const kpiA = ref({
  mediaCaixaTeste: 0,
  mediaLotePrincipal: 0,
  grafico: [] as LeadTimeItem[]
})
const kpiB = ref([] as GargaloItem[])
const kpiC = ref({
  fpyGlobal: 100,
  setores: [] as FpySetor[]
})
const kpiD = ref({
  totalRetrabalhos: 0,
  setores: [] as RetrabalhoSetor[]
})

// Filtros locais e estatística secundária
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

// Modal de detalhes da foto do gargalo
const modalFotoUrl = ref<string | null>(null)

// Timeline Dual - Estados
const lotes = ref<any[]>([])
const modelos = ref<any[]>([])
const selectedLoteId = ref<string>('')
const selectedLoteHistory = ref<any[]>([])

// ==========================================
// FUNÇÕES DE DADOS E WEBSOCKET
// ==========================================
async function fetchLotesAndModelos() {
  try {
    const [lotesRes, modelosRes] = await Promise.all([
      api.get('/lotes'),
      api.get('/admin/modelos/catalogo')
    ])
    modelos.value = modelosRes.data
    
    lotes.value = lotesRes.data.map((l: any) => {
      const mod = modelos.value.find(m => m.id === l.modeloId)
      return {
        ...l,
        modeloNome: mod ? mod.nome : 'N/A'
      }
    })

    if (lotes.value.length > 0 && !selectedLoteId.value) {
      selectedLoteId.value = lotes.value[0].id
    }
  } catch (error) {
    console.error('Error fetching lotes/modelos:', error)
  }
}

async function fetchSelectedLoteHistory() {
  if (!selectedLoteId.value) return
  try {
    const res = await api.get(`/rastreamentos/historico/${selectedLoteId.value}`)
    selectedLoteHistory.value = res.data.historico
  } catch (error) {
    console.error('Error fetching lote history:', error)
  }
}

async function fetchKpis() {
  try {
    const res = await api.get('/dashboard/kpis')
    kpiA.value = res.data.kpiA
    kpiB.value = res.data.kpiB
    kpiC.value = res.data.kpiC
    kpiD.value = res.data.kpiD
    
    await fetchSelectedLoteHistory()
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error)
  } finally {
    loading.value = false
  }
}

function initWebSocket() {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
  const socketUrl = apiUrl.replace('/api', '')

  socket = io(socketUrl, {
    transports: ['websocket'],
    reconnection: true,
  })

  socket.on('connect', () => {
    liveStatus.value = 'CONNECTED'
    console.log('WebSocket connected to dashboard server')
  })

  socket.on('disconnect', () => {
    liveStatus.value = 'DISCONNECTED'
    console.log('WebSocket disconnected from dashboard server')
  })

  socket.on('peca:avanco', (data: any) => {
    console.log('Real-time event received [peca:avanco]:', data)
    fetchKpis()
    fetchLotesAndModelos()
  })

  socket.on('gargalo:update', (data: any) => {
    console.log('Real-time event received [gargalo:update]:', data)
    fetchKpis()
  })
}

// ==========================================
// CALCULAR POSIÇÕES DO STEPPER DUAL
// ==========================================
function getStepIdForSector(sector: any) {
  if (!sector) return null
  const tipo = sector.tipoSetor || ''
  const nome = (sector.nome || '').toUpperCase()

  const matchedStep = steps.find(s => s.valores.includes(tipo))
  if (matchedStep) return matchedStep.id

  if (nome.includes('ALMOXARIFADO')) return 'almoxarifado'
  if (nome.includes('NAVALHA')) return 'navalha'
  if (nome.includes('TELA')) return 'telas'
  if (nome.includes('CORTE')) return 'corte'
  if (nome.includes('SERIGRAFIA')) return 'serigrafia_bordado'
  if (nome.includes('BORDADO')) return 'serigrafia_bordado'
  if (nome.includes('APOIO')) return 'apoio'
  if (nome.includes('COSTURA')) return 'costura'
  if (nome.includes('PRÉ-FABRICADO') || nome.includes('PRE-FABRICADO') || nome.includes('FABRICADO')) return 'pre_fabricado'
  if (nome.includes('MONTAGEM')) return 'montagem'
  if (nome.includes('VULCANIZADO')) return 'vulcanizado'
  if (nome.includes('LABORATÓRIO') || nome.includes('LABORATORIO')) return 'laboratorio'

  return null
}

const currentCaixaTesteStepId = computed(() => {
  if (!selectedLoteHistory.value || selectedLoteHistory.value.length === 0) return null
  const trackings = selectedLoteHistory.value.filter(r => r.tipoLote === 'CAIXA_TESTE')
  if (trackings.length === 0) return null
  
  const active = trackings.find(r => !r.dataSaida)
  const currentSector = active ? active.setor : trackings[trackings.length - 1].setor
  return getStepIdForSector(currentSector)
})

const currentLotePrincipalStepId = computed(() => {
  if (!selectedLoteHistory.value || selectedLoteHistory.value.length === 0) return null
  const trackings = selectedLoteHistory.value.filter(r => r.tipoLote === 'LOTE_PRINCIPAL')
  if (trackings.length === 0) return null
  
  const active = trackings.find(r => !r.dataSaida)
  const currentSector = active ? active.setor : trackings[trackings.length - 1].setor
  return getStepIdForSector(currentSector)
})

function isStepActive(stepId: string) {
  return currentCaixaTesteStepId.value === stepId || currentLotePrincipalStepId.value === stepId
}

function isStepCompleted(stepId: string) {
  const stepIdx = steps.findIndex(s => s.id === stepId)
  const ctStepIdx = steps.findIndex(s => s.id === currentCaixaTesteStepId.value)
  const lpStepIdx = steps.findIndex(s => s.id === currentLotePrincipalStepId.value)
  
  const furthestReached = Math.max(ctStepIdx, lpStepIdx)
  return stepIdx < furthestReached
}

// Watchers
watch(selectedLoteId, () => {
  fetchSelectedLoteHistory()
})

// ==========================================
// HOOKS
// ==========================================
onMounted(() => {
  fetchLotesAndModelos().then(() => {
    fetchKpis()
  })
  initWebSocket()
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
})

// Helper de formatação de imagem URL
function getFotoUrl(path: string) {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
  const base = apiUrl.replace('/api', '')
  return `${base}/${path}`
}

function formatHour(val: number) {
  const hours = Math.floor(val)
  const minutes = Math.round((val - hours) * 60)
  return `${hours}h ${minutes}min`
}
</script>

<template>
  <div class="dashboard-gerencial">
    <!-- Header brutalista / Light Mode -->
    <header class="dashboard-header border-b border-slate-200 pb-6 mb-8">
      <div class="header-left">
        <h1 class="panel-title-giant text-slate-900">TORRE DE CONTROLE</h1>
        <p class="panel-subtitle-dim text-slate-500">Monitoramento em tempo real de KPIs de engenharia e modelagem</p>
      </div>

      <div class="header-right">
        <!-- Status de conexão em tempo real -->
        <div class="status-indicator border border-slate-200">
          <span :class="['status-dot', liveStatus === 'CONNECTED' ? 'status-dot--live' : 'status-dot--offline']"></span>
          <span class="status-text text-slate-600 font-mono">{{ liveStatus === 'CONNECTED' ? 'SINC. LIVE ATIVA' : 'SINC. OFFLINE' }}</span>
        </div>

        <button @click="fetchKpis" class="btn-refresh text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm" type="button" aria-label="Recarregar dados">
          <RotateCcw :size="14" class="text-slate-600" />
          <span>Sincronizar</span>
        </button>
      </div>
    </header>

    <!-- Bento Grid principal assimétrico -->
    <div v-if="loading" class="skeleton-wrapper">
      <div class="skeleton-card skeleton-card--span-12"></div>
      <div class="skeleton-card skeleton-card--span-7"></div>
      <div class="skeleton-card skeleton-card--span-5"></div>
      <div class="skeleton-card skeleton-card--span-6"></div>
      <div class="skeleton-card skeleton-card--span-6"></div>
    </div>

    <div v-else class="bento-grid">
      <!-- PAINEL E: TIMELINE DUAL (Horizontal Stepper) -->
      <section class="bento-card bento-card--span-12 layout-glass hover-spring">
        <div class="card-heading-simple flex justify-between items-center w-full">
          <div class="flex items-start gap-2">
            <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
              <Activity :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="card-title-brutalist text-slate-800">STATUS DA PRODUÇÃO (TIMELINE DUAL)</h2>
              <p class="card-desc-brutalist text-slate-500">Fluxo de setores e rastreamento em tempo real de Caixa Teste e Lote Principal</p>
            </div>
          </div>

          <!-- Seletor de Lote -->
          <div class="flex items-center gap-2 select-container">
            <label for="lote-select" class="text-xs font-semibold text-slate-600 font-mono">LOTE SELECIONADO:</label>
            <select
              id="lote-select"
              v-model="selectedLoteId"
              class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none transition-colors duration-300"
            >
              <option v-for="lote in lotes" :key="lote.id" :value="lote.id">
                {{ lote.codigoBarras }} ({{ lote.modeloNome }})
              </option>
            </select>
          </div>
        </div>

        <!-- Stepper Visual -->
        <div class="stepper-scroll-container">
          <div v-if="!selectedLoteId" class="empty-state-brutalist border-slate-200 text-slate-400 py-6">
            Nenhuma ordem de teste ativa disponível para visualização.
          </div>
          <div v-else class="stepper-track">
            <div
              v-for="(step, idx) in steps"
              :key="step.id"
              class="step-node-wrapper"
              :class="{
                'step-completed': isStepCompleted(step.id),
                'step-active': isStepActive(step.id)
              }"
            >
              <!-- Linha de conexão com o passo anterior -->
              <div v-if="idx > 0" class="step-connector"></div>

              <!-- Nó do Stepper -->
              <div class="step-node">
                <!-- Floating Indicators para os Lotes -->
                <div class="floating-indicators-container">
                  <!-- Caixa Teste (Badge Laranja) -->
                  <span
                    v-if="currentCaixaTesteStepId === step.id"
                    class="lote-badge bg-orange-500 text-white font-mono shadow-sm animate-bounce-slow"
                    title="Caixa Teste está neste setor"
                  >
                    CT
                  </span>
                  <!-- Lote Principal (Badge Azul) -->
                  <span
                    v-if="currentLotePrincipalStepId === step.id"
                    class="lote-badge bg-blue-600 text-white font-mono shadow-sm animate-bounce-slow"
                    title="Lote Principal está neste setor"
                  >
                    LP
                  </span>
                </div>

                <!-- Círculo do Nó -->
                <div class="node-circle border-slate-200">
                  <span class="node-number font-mono">{{ idx + 1 }}</span>
                </div>

                <!-- Etiqueta do Nó -->
                <span class="node-label text-slate-700 font-semibold">{{ step.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL A: LEAD TIME DO TESTE (Destaque Tipográfico Massivo) -->
      <section class="bento-card bento-card--span-7 layout-glass hover-spring">
        <div class="card-heading-simple">
          <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
            <Clock :size="16" class="text-slate-700" />
          </div>
          <div>
            <h2 class="card-title-brutalist text-slate-800">LEAD TIME MÉDIO</h2>
            <p class="card-desc-brutalist text-slate-500">Tempo médio decorrido descontando interrupções ativas de SLA (últimas 5 ordens)</p>
          </div>
        </div>

        <div class="kpi-a-content">
          <div class="kpi-numbers-wrap">
            <div class="kpi-stat-col">
              <span class="kpi-label-dim font-mono text-slate-500">CAIXA TESTE</span>
              <span class="kpi-value-massive font-mono tracking-tighter text-slate-900">{{ formatHour(kpiA.mediaCaixaTeste) }}</span>
            </div>
            <div class="kpi-stat-col border-l border-slate-200 pl-8">
              <span class="kpi-label-dim font-mono text-slate-500">LOTE PRINCIPAL</span>
              <span class="kpi-value-massive font-mono tracking-tighter text-slate-800">{{ formatHour(kpiA.mediaLotePrincipal) }}</span>
            </div>
          </div>

          <!-- SVG Sparkline brutalista feito sob medida -->
          <div class="sparkline-container mt-8 border border-slate-200/60 bg-slate-50/50 p-4 rounded-xl">
            <div class="sparkline-header mb-3">
              <span class="text-slate-500 font-mono text-xs">Variação do Tempo de Ciclo (Últimas 10)</span>
            </div>
            <div class="sparkline-wrapper">
              <svg viewBox="0 0 500 80" class="w-full h-20 overflow-visible">
                <!-- Grid lines -->
                <line x1="0" y1="40" x2="500" y2="40" stroke="#e2e8f0" stroke-dasharray="4" />
                
                <!-- Polyline Lote Principal -->
                <path
                  v-if="kpiA.grafico.length > 0"
                  fill="none"
                  stroke="#3b82f6"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :d="kpiA.grafico
                    .map((item, i) => {
                      const maxVal = Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)
                      const x = (i / Math.max(1, kpiA.grafico.length - 1)) * 500
                      const y = 80 - (item.leadTimeHoras / maxVal) * 60 - 10
                      return `${x},${y}`
                    })
                    .reduce((acc, curr, idx) => idx === 0 ? `M ${curr}` : `${acc} L ${curr}`, '')"
                />

                <!-- Pontos do Gráfico -->
                <circle
                  v-for="(item, i) in kpiA.grafico"
                  :key="i"
                  :cx="(i / Math.max(1, kpiA.grafico.length - 1)) * 500"
                  :cy="80 - (item.leadTimeHoras / Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)) * 60 - 10"
                  r="3.5"
                  fill="#ffffff"
                  stroke="#3b82f6"
                  stroke-width="2"
                />
              </svg>
            </div>
            <div class="sparkline-legend mt-2 flex justify-between font-mono text-[10px] text-slate-400">
              <span>Recentes</span>
              <span>Antigos</span>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL B: MAPA DE GARGALOS (Lista de Ocorrências com badge vermelho fosco) -->
      <section class="bento-card bento-card--span-5 layout-glass hover-spring">
        <div class="card-heading-simple">
          <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
            <AlertTriangle :size="16" class="text-slate-700" />
          </div>
          <div>
            <h2 class="card-title-brutalist text-slate-800">GARGALOS OPERACIONAIS</h2>
            <p class="card-desc-brutalist text-slate-500">Incidentes em aberto interrompendo ou atrasando a produção</p>
          </div>
        </div>

        <div class="gargalos-wrapper">
          <div v-if="kpiB.length === 0" class="empty-state-brutalist border-slate-200 text-slate-400">
            Nenhum gargalo registrado ou em análise no momento.
          </div>
          <div v-else class="gargalos-list">
            <div
              v-for="oc in kpiB"
              :key="oc.id"
              class="gargalo-item border border-slate-200/80 bg-slate-50/40 p-4 rounded-xl flex gap-4 transition-colors duration-300"
            >
              <div class="gargalo-body flex-1">
                <div class="gargalo-meta">
                  <span :class="['badge-gravity', oc.gravidade === 'CRITICA' || oc.gravidade === 'ALTA' ? 'badge-gravity--red' : 'badge-gravity--orange']">
                    {{ oc.gravidade }}
                  </span>
                  <span class="gargalo-sector font-mono text-slate-500 text-xs">{{ oc.setor }}</span>
                </div>
                <h3 class="gargalo-title text-slate-800 font-bold text-sm mt-1">{{ oc.titulo }}</h3>
                <p class="gargalo-desc text-slate-500 text-xs mt-1 leading-relaxed">{{ oc.descricao }}</p>
                <div class="gargalo-footer mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                  <span>Por: {{ oc.reportadoPor }}</span>
                </div>
              </div>

              <!-- Visualização de Imagem Redondinha (0.75rem / rounded-xl) -->
              <div v-if="oc.fotos && oc.fotos.length > 0" class="gargalo-photo-wrapper">
                <div @click="modalFotoUrl = getFotoUrl(oc.fotos[0])" class="gargalo-photo-cutout border border-slate-200/60 rounded-xl" role="button" aria-label="Visualizar foto da ocorrência">
                  <img :src="getFotoUrl(oc.fotos[0])" alt="Foto da ocorrencia" class="gargalo-image rounded-xl" />
                  <div class="photo-overlay rounded-xl">
                    <Eye :size="14" class="text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL C: FPY - FIRST PASS YIELD (Barras de progresso brutalistas) -->
      <section class="bento-card bento-card--span-6 layout-glass hover-spring">
        <div class="card-heading-simple">
          <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
            <TrendingUp :size="16" class="text-slate-700" />
          </div>
          <div>
            <h2 class="card-title-brutalist text-slate-800">FIRST PASS YIELD (FPY)</h2>
            <p class="card-desc-brutalist text-slate-500">Percentual de aprovações sem retrabalho na primeira inspeção (últimos 30 dias)</p>
          </div>
        </div>

        <div class="fpy-content-wrap">
          <div class="fpy-global-display mb-6">
            <span class="kpi-label-dim font-mono text-slate-500">FPY GLOBAL</span>
            <div class="fpy-global-number-row mt-1">
              <span class="text-6xl font-mono tracking-tighter text-slate-900">{{ kpiC.fpyGlobal }}%</span>
              <span :class="['fpy-status-pill font-mono text-xs ml-4', kpiC.fpyGlobal >= 90 ? 'fpy-status-pill--meta' : 'fpy-status-pill--alert']">
                {{ kpiC.fpyGlobal >= 90 ? 'META ALCANÇADA' : 'ABAIXO DA META' }}
              </span>
            </div>
          </div>

          <div class="fpy-setores-list">
            <div v-if="kpiC.setores.length === 0" class="text-slate-500 font-mono text-xs">
              Sem dados de inspeções de saída de setores nas últimas semanas.
            </div>
            <div v-else v-for="item in kpiC.setores" :key="item.setor" class="fpy-setor-item mb-4">
              <div class="setor-row-info flex justify-between font-mono text-xs mb-1">
                <span class="text-slate-700 font-bold">{{ item.setor }}</span>
                <span class="text-slate-800 font-semibold">{{ item.fpyPercentual }}%</span>
              </div>
              <div class="brutalist-bar-bg border border-slate-200/60 bg-slate-100 rounded-lg">
                <div
                  class="brutalist-bar-fill rounded-lg"
                  :style="{ width: `${item.fpyPercentual}%` }"
                  :class="[item.fpyPercentual >= 90 ? 'bar-emerald' : 'bar-muted-red']"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL D: ÍNDICE DE RETRABALHO POR SETOR (Barras horizontais minimalistas) -->
      <section class="bento-card bento-card--span-6 layout-glass hover-spring">
        <div class="card-heading-simple">
          <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
            <RotateCcw :size="16" class="text-slate-700" />
          </div>
          <div>
            <h2 class="card-title-brutalist text-slate-800">ÍNDICE DE RETRABALHO</h2>
            <p class="card-desc-brutalist text-slate-500">Ranking de setores que geraram maior volume de peças reprovadas (últimos 30 dias)</p>
          </div>
        </div>

        <div class="retrabalho-content-wrap">
          <div class="retrabalho-total-display mb-6">
            <span class="kpi-label-dim font-mono text-slate-500">RETRABALHOS DETECTADOS</span>
            <div class="mt-1">
              <span class="text-6xl font-mono tracking-tighter text-slate-900">{{ kpiD.totalRetrabalhos }}</span>
              <span class="font-mono text-slate-500 text-xs ml-3 font-semibold">casos totais</span>
            </div>
          </div>

          <div class="retrabalho-setores-list">
            <div v-if="kpiD.setores.length === 0" class="text-slate-500 font-mono text-xs">
              Nenhum retrabalho apontado nos setores nos últimos 30 dias.
            </div>
            <div v-else v-for="item in kpiD.setores" :key="item.setorOrigem" class="retrabalho-setor-item mb-4">
              <div class="setor-row-info flex justify-between font-mono text-xs mb-1">
                <span class="text-slate-700 font-bold">{{ item.setorOrigem }}</span>
                <span class="text-slate-600">{{ item.totalRetrabalhos }} casos ({{ item.percentualDoTotal }}%)</span>
              </div>
              <div class="brutalist-bar-bg border border-slate-200/60 bg-slate-100 rounded-lg">
                <div
                  class="brutalist-bar-fill bar-muted-orange rounded-lg"
                  :style="{ width: `${item.percentualDoTotal}%` }"
                ></div>
              </div>
              <div class="setor-row-details flex justify-between font-mono text-[9px] text-slate-400 mt-1">
                <span>Tempo Médio: {{ item.tempoMedioMin }} min</span>
                <span class="truncate max-w-[250px]" :title="item.tiposDivergencia">Divergências: {{ item.tiposDivergencia }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- MODAL DE IMAGEM AMPLIADA (Liquid-glass overlay) -->
    <div v-if="modalFotoUrl" @click="modalFotoUrl = null" class="photo-modal-overlay">
      <div class="photo-modal-content border border-slate-200 bg-white/95 p-2 rounded-2xl" @click.stop>
        <img :src="modalFotoUrl" alt="Foto ampliada" class="photo-modal-image rounded-xl" />
        <button @click="modalFotoUrl = null" class="btn-close-modal font-mono shadow-sm">Fechar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================
   ROOT CONTAINER & LAYOUT GENERAL
   ========================================== */
.dashboard-gerencial {
  min-height: 100%;
  background-color: transparent;
  padding: 1rem 0 2rem;
  color: #334155;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  text-align: left !important;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.panel-title-giant {
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  margin: 0;
  line-height: 1.1;
}

.panel-subtitle-dim {
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* ==========================================
   STATUS INDICATOR & REFRESH BUTTON
   ========================================== */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 0.375rem 0.75rem;
  border-radius: 2rem;
  backdrop-filter: blur(8px);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot--live {
  background-color: #10b981; /* Verde esmeralda vivo */
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.status-dot--offline {
  background-color: #94a3b8; /* slate-400 */
}

.status-text {
  font-size: 10px;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 600;
  background: #ffffff;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

/* ==========================================
   BENTO GRID SYSTEM
   ========================================== */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1.5rem;
}

.bento-card {
  border-radius: 1.25rem;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  position: relative;
}

.bento-card--span-12 { grid-column: span 12; }
.bento-card--span-7 { grid-column: span 7; }
.bento-card--span-6 { grid-column: span 6; }
.bento-card--span-5 { grid-column: span 5; }

/* Liquid Glass effect - Light Mode Premium */
.layout-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02);
}

/* Physics of Spring (Easing) */
.hover-spring {
  transition: all 0.5s cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform, box-shadow;
}

.hover-spring:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
}

/* ==========================================
   CARD HEADINGS
   ========================================== */
.card-heading-simple {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  margin-bottom: 1.75rem;
}

.heading-icon-wrap {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-title-brutalist {
  font-size: 0.875rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  margin: 0;
}

.card-desc-brutalist {
  font-size: 0.75rem;
  margin-top: 0.125rem;
}

/* ==========================================
   PAINEL E: TIMELINE DUAL
   ========================================== */
.select-container {
  flex-shrink: 0;
}

.stepper-scroll-container {
  overflow-x: auto;
  padding: 2.25rem 0.5rem 0.75rem;
  -webkit-overflow-scrolling: touch;
}

.stepper-track {
  display: flex;
  align-items: center;
  min-width: max-content;
  width: 100%;
  padding-bottom: 0.5rem;
}

.step-node-wrapper {
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
}

.step-connector {
  height: 3px;
  background: #e2e8f0;
  flex-grow: 1;
  min-width: 2.5rem;
  margin: 0 -0.5rem;
  transition: background 0.3s;
}

.step-completed .step-connector {
  background: #3b82f6;
}

.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
  min-width: 7rem;
}

.node-circle {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  border: 2px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 10;
}

.step-active .node-circle {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
}

.step-completed .node-circle {
  border-color: #3b82f6;
  background: #3b82f6;
}

.node-number {
  font-size: 0.75rem;
  font-weight: 750;
  color: #64748b;
  transition: color 0.3s;
}

.step-completed .node-number {
  color: #ffffff;
}

.step-active .node-number {
  color: #3b82f6;
}

.node-label {
  font-size: 0.75rem;
  text-align: center;
  white-space: nowrap;
  transition: color 0.3s;
}

.step-active .node-label {
  color: #0f172a;
}

.step-completed .node-label {
  color: #334155;
}

/* Floating lote indicators */
.floating-indicators-container {
  position: absolute;
  top: -1.8rem;
  display: flex;
  gap: 0.25rem;
  justify-content: center;
  align-items: center;
  z-index: 20;
}

.lote-badge {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 9px;
  font-weight: 800;
  padding: 0.125rem 0.375rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
}

@keyframes bounce-slow {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 2s infinite ease-in-out;
}

/* ==========================================
   PAINEL A: LEAD TIME DO TESTE
   ========================================== */
.kpi-numbers-wrap {
  display: flex;
  margin-top: 1rem;
}

.kpi-stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.kpi-label-dim {
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
}

.kpi-value-massive {
  font-size: 4rem;
  font-weight: 800;
  line-height: 1;
  margin-top: 0.5rem;
  letter-spacing: -0.04em;
}

@media (min-width: 1920px) {
  .kpi-value-massive { font-size: 5rem; }
}
@media (min-width: 2560px) {
  .kpi-value-massive { font-size: 6.5rem; }
}

.sparkline-wrapper {
  margin-top: 0.5rem;
}

/* ==========================================
   PAINEL B: GARGALOS OPERACIONAIS
   ========================================== */
.gargalos-wrapper {
  overflow-y: auto;
  max-height: 380px;
  padding-right: 0.25rem;
}

.gargalos-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.gargalo-item {
  transition: all 0.3s ease;
}

.gargalo-item:hover {
  border-color: #cbd5e1;
  background: rgba(248, 250, 252, 0.8);
}

.gargalo-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.badge-gravity {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 9px;
  font-weight: 800;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.badge-gravity--red {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.badge-gravity--orange {
  background-color: rgba(249, 115, 22, 0.1);
  color: #ea580c;
  border: 1px solid rgba(249, 115, 22, 0.2);
}

.gargalo-photo-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* Custom rounded corners for photos */
.gargalo-photo-cutout {
  width: 3.5rem;
  height: 3.5rem;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.gargalo-photo-cutout:hover {
  transform: scale(1.08) rotate(1deg);
}

.gargalo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.gargalo-photo-cutout:hover .photo-overlay {
  opacity: 1;
}

/* ==========================================
   PAINEL C & D: FPY E RETRABALHO BARS
   ========================================== */
.fpy-global-number-row, .retrabalho-total-display > div {
  display: flex;
  align-items: baseline;
}

.fpy-status-pill {
  padding: 0.25rem 0.625rem;
  border-radius: 2rem;
  font-weight: 700;
}

.fpy-status-pill--meta {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.fpy-status-pill--alert {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.brutalist-bar-bg {
  width: 100%;
  height: 8px;
  overflow: hidden;
}

.brutalist-bar-fill {
  height: 100%;
  transition: width 0.8s cubic-bezier(0.32, 0.72, 0, 1);
}

.bar-emerald { background-color: #10b981; }
.bar-muted-red { background-color: #ef4444; }
.bar-muted-orange { background-color: #f97316; }

/* ==========================================
   EMPTY AND SKELETON STATES
   ========================================== */
.empty-state-brutalist {
  padding: 2.5rem 1rem;
  text-align: center;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.skeleton-wrapper {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1.5rem;
}

.skeleton-card {
  height: 250px;
  background: #e2e8f0;
  border-radius: 1.25rem;
  animation: pulse-skele 1.8s infinite ease-in-out;
}

.skeleton-card--span-12 { grid-column: span 12; height: 160px; }
.skeleton-card--span-7 { grid-column: span 7; }
.skeleton-card--span-6 { grid-column: span 6; }
.skeleton-card--span-5 { grid-column: span 5; }

@keyframes pulse-skele {
  0% { opacity: 0.5; }
  50% { opacity: 0.8; }
  100% { opacity: 0.5; }
}

/* ==========================================
   MODAL PHOTO VIEW
   ========================================== */
.photo-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.photo-modal-content {
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.photo-modal-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.btn-close-modal {
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
  cursor: pointer;
  border-radius: 0.5rem;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-close-modal:hover {
  background: #f8fafc;
}
</style>
