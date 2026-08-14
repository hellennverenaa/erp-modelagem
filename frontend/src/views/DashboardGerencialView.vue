<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api from '../api/axios'
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
  WifiOff
} from 'lucide-vue-next'

// ==========================================
// INTERFACES
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
// ESTADO REATIVO
// ==========================================
const loading = ref(true)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

const kpiA = ref<KpiAData>({
  mediaCaixaTeste: 0,
  mediaLotePrincipal: 0,
  downtimeTotalMin: 0,
  downtimeTotalHoras: 0,
  motivosParada: [],
  grafico: []
})

const kpiB = ref<GargaloItem[]>([])

const kpiC = ref<{ fpyGlobal: number; setores: FpySetor[] }>({
  fpyGlobal: 100,
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
// BUSCA DE DADOS
// ==========================================
async function fetchKpis() {
  try {
    const res = await api.get('/dashboard/kpis')
    kpiA.value = {
      mediaCaixaTeste: res.data.kpiA?.mediaCaixaTeste ?? 0,
      mediaLotePrincipal: res.data.kpiA?.mediaLotePrincipal ?? 0,
      downtimeTotalMin: res.data.kpiA?.downtimeTotalMin ?? 0,
      downtimeTotalHoras: res.data.kpiA?.downtimeTotalHoras ?? 0,
      motivosParada: res.data.kpiA?.motivosParada ?? [],
      grafico: res.data.kpiA?.grafico ?? []
    }
    kpiB.value = res.data.kpiB ?? []
    kpiC.value = res.data.kpiC ?? { fpyGlobal: 100, setores: [] }
    kpiD.value = res.data.kpiD ?? { totalRetrabalhos: 0, setores: [] }
  } catch (error) {
    console.error('[Dashboard] Erro ao buscar KPIs:', error)
  } finally {
    loading.value = false
  }
}

// ==========================================
// WEBSOCKET
// ==========================================
function initWebSocket() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const socketUrl = apiUrl.replace(/\/api\/?$/, '')
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
// GALERIA DE FOTOS
// ==========================================
function getFotoUrl(path: string) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '')
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
// FORMATAÇÃO
// ==========================================
function formatHour(val: number) {
  if (!val || isNaN(val)) return '—'
  const h = Math.floor(val)
  const m = Math.round((val - h) * 60)
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
// LIFECYCLE
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
  <div class="tc-root">

    <!-- ─── CABEÇALHO ─────────────────────────────────────────────────── -->
    <header class="tc-header">
      <div class="tc-header__left">
        <div class="tc-header__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </div>
        <div>
          <h1 class="tc-header__title">Torre de Controle de Produção</h1>
          <p class="tc-header__sub">KPIs gerenciais em tempo real — Lead Time · Gargalos · FPY · Retrabalho</p>
        </div>
      </div>

      <div class="tc-header__right">
        <div class="tc-live-badge" :class="liveStatus === 'CONNECTED' ? 'tc-live-badge--on' : 'tc-live-badge--off'">
          <span class="tc-live-dot"></span>
          <Wifi v-if="liveStatus === 'CONNECTED'" :size="12" />
          <WifiOff v-else :size="12" />
          <span>{{ liveStatus === 'CONNECTED' ? 'Sincronizado' : 'Offline' }}</span>
        </div>
        <button class="tc-btn-refresh" type="button" @click="fetchKpis" aria-label="Sincronizar KPIs">
          <RefreshCw :size="14" />
          <span>Atualizar</span>
        </button>
      </div>
    </header>

    <!-- ─── SKELETON LOADING ──────────────────────────────────────────── -->
    <div v-if="loading" class="tc-skeleton-grid">
      <div class="tc-skeleton tc-skeleton--half"></div>
      <div class="tc-skeleton tc-skeleton--half"></div>
      <div class="tc-skeleton tc-skeleton--full"></div>
      <div class="tc-skeleton tc-skeleton--half"></div>
      <div class="tc-skeleton tc-skeleton--half"></div>
    </div>

    <!-- ─── BENTO GRID DOS 4 KPIs ─────────────────────────────────────── -->
    <div v-else class="tc-bento">

      <!-- ══════════════════════════════════════════════════════════════ -->
      <!-- KPI A · LEAD TIME EFETIVO & DOWNTIME (Linha 1 - span completo) -->
      <!-- ══════════════════════════════════════════════════════════════ -->
      <section class="tc-card tc-card--lead-time">
        <div class="tc-card__header">
          <div class="tc-icon-wrap tc-icon-wrap--blue">
            <Clock :size="18" />
          </div>
          <div>
            <h2 class="tc-card__title">Lead Time Efetivo & Downtime Acumulado</h2>
            <p class="tc-card__desc">Tempo absoluto de permanência de cada lote e paradas que ativaram o SLA</p>
          </div>
        </div>

        <!-- Trio de métricas lado a lado -->
        <div class="tc-metrics-row">
          <!-- Caixa Teste -->
          <div class="tc-metric-box tc-metric-box--blue">
            <span class="tc-metric-box__label">Caixa Teste</span>
            <span class="tc-metric-box__label tc-metric-box__label--sub">Média Lead Time</span>
            <span class="tc-metric-box__value">{{ formatHour(kpiA.mediaCaixaTeste) }}</span>
            <span class="tc-metric-box__hint">Tempo total de ciclo</span>
          </div>

          <!-- Lote Principal -->
          <div class="tc-metric-box tc-metric-box--indigo">
            <span class="tc-metric-box__label">Lote Principal</span>
            <span class="tc-metric-box__label tc-metric-box__label--sub">Média Lead Time</span>
            <span class="tc-metric-box__value">{{ formatHour(kpiA.mediaLotePrincipal) }}</span>
            <span class="tc-metric-box__hint">Tempo total de ciclo</span>
          </div>

          <!-- Downtime Acumulado -->
          <div class="tc-metric-box tc-metric-box--red">
            <div class="flex items-center gap-1.5">
              <PauseCircle :size="14" class="text-rose-500" />
              <span class="tc-metric-box__label tc-metric-box__label--red">Downtime Acumulado</span>
            </div>
            <span class="tc-metric-box__label tc-metric-box__label--sub">Paradas com SLA</span>
            <span class="tc-metric-box__value tc-metric-box__value--red">{{ kpiA.downtimeTotalHoras }}h</span>
            <span class="tc-metric-box__hint tc-metric-box__hint--red">{{ kpiA.downtimeTotalMin }} min acumulados</span>
          </div>
        </div>

        <!-- Seção de motivos de parada + sparkline em paralelo -->
        <div class="tc-lead-body">

          <!-- Motivos reais de parada -->
          <div class="tc-motivos">
            <div class="tc-motivos__header">
              <Wrench :size="14" class="text-slate-500" />
              <span>Motivos Reais de Parada (30 dias)</span>
            </div>

            <div v-if="kpiA.motivosParada.length === 0" class="tc-empty">
              Nenhuma parada por ocorrência neste período.
            </div>

            <div v-else class="tc-motivos__list">
              <div
                v-for="item in kpiA.motivosParada"
                :key="item.motivo"
                class="tc-motivo-item"
              >
                <div class="tc-motivo-item__top">
                  <span class="tc-motivo-item__name">{{ item.motivo }}</span>
                  <div class="tc-motivo-item__stats">
                    <span class="tc-motivo-item__qty">{{ item.quantidade }} {{ item.quantidade === 1 ? 'ocorr.' : 'ocorr.' }}</span>
                    <span class="tc-motivo-item__time">{{ formatMin(item.minutos) }}</span>
                    <span class="tc-motivo-item__pct">{{ item.percentual }}%</span>
                  </div>
                </div>
                <div class="tc-bar-track">
                  <div class="tc-bar-fill tc-bar-fill--rose" :style="{ width: `${Math.min(100, item.percentual)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sparkline do histórico de lead time -->
          <div class="tc-sparkline-wrap">
            <div class="tc-sparkline__header">
              <span>Variação do Lead Time (últimas ordens)</span>
            </div>
            <div class="tc-sparkline__chart">
              <svg viewBox="0 0 440 90" class="tc-svg" aria-hidden="true">
                <!-- Grid lines -->
                <line x1="0" y1="45" x2="440" y2="45" stroke="#e2e8f0" stroke-dasharray="3 3" />
                <line x1="0" y1="20" x2="440" y2="20" stroke="#f1f5f9" stroke-dasharray="3 3" />
                <line x1="0" y1="70" x2="440" y2="70" stroke="#f1f5f9" stroke-dasharray="3 3" />

                <!-- Área sombreada -->
                <path
                  v-if="kpiA.grafico.length > 1"
                  fill="url(#grad-blue)"
                  opacity="0.18"
                  :d="(() => {
                    const g = kpiA.grafico
                    const maxV = Math.max(...g.map(x => x.leadTimeHoras), 1)
                    const pts = g.map((item, i) => {
                      const x = (i / Math.max(1, g.length - 1)) * 440
                      const y = 80 - (item.leadTimeHoras / maxV) * 60
                      return `${x},${y}`
                    })
                    const first = pts[0].split(',')
                    const last = pts[pts.length - 1].split(',')
                    return `M ${pts.join(' L ')} L ${last[0]},80 L ${first[0]},80 Z`
                  })()"
                />

                <!-- Linha do gráfico -->
                <path
                  v-if="kpiA.grafico.length > 1"
                  fill="none"
                  stroke="#2563eb"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :d="kpiA.grafico
                    .map((item, i) => {
                      const maxV = Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)
                      const x = (i / Math.max(1, kpiA.grafico.length - 1)) * 440
                      const y = 80 - (item.leadTimeHoras / maxV) * 60
                      return `${x},${y}`
                    })
                    .reduce((acc, curr, idx) => idx === 0 ? `M ${curr}` : `${acc} L ${curr}`, '')"
                />

                <!-- Pontos -->
                <circle
                  v-for="(item, i) in kpiA.grafico"
                  :key="i"
                  :cx="(i / Math.max(1, kpiA.grafico.length - 1)) * 440"
                  :cy="80 - (item.leadTimeHoras / Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)) * 60"
                  r="4"
                  fill="#fff"
                  stroke="#2563eb"
                  stroke-width="2"
                />

                <defs>
                  <linearGradient id="grad-blue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#2563eb" />
                    <stop offset="100%" stop-color="#2563eb" stop-opacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div class="tc-sparkline__legend">
              <span>← Mais recentes</span>
              <span>Anteriores →</span>
            </div>
          </div>

        </div>
      </section>

      <!-- ══════════════════════════════════════════════════════════════ -->
      <!-- KPI B · MAPA DE GARGALOS & GALERIA (Linha 2 - metade esquerda) -->
      <!-- ══════════════════════════════════════════════════════════════ -->
      <section class="tc-card tc-card--gargalos">
        <div class="tc-card__header">
          <div class="tc-icon-wrap tc-icon-wrap--amber">
            <AlertTriangle :size="18" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="tc-card__title">Gargalos Operacionais</h2>
            <p class="tc-card__desc">Ocorrências ativas em aberto ou em análise no chão de fábrica</p>
          </div>
          <span class="tc-badge-count" :class="kpiB.length > 0 ? 'tc-badge-count--amber' : 'tc-badge-count--green'">
            {{ kpiB.length }} {{ kpiB.length === 1 ? 'ativo' : 'ativos' }}
          </span>
        </div>

        <div class="tc-gargalos-list">
          <div v-if="kpiB.length === 0" class="tc-empty tc-empty--tall">
            <span>✓</span>
            <span>Nenhum gargalo ativo no momento. Produção fluindo normalmente.</span>
          </div>

          <div
            v-else
            v-for="oc in kpiB"
            :key="oc.id"
            class="tc-gargalo-item"
          >
            <div class="tc-gargalo-item__body">
              <div class="tc-gargalo-item__meta">
                <span class="tc-badge-grav" :class="{
                  'tc-badge-grav--critica': oc.gravidade === 'CRITICA',
                  'tc-badge-grav--alta': oc.gravidade === 'ALTA',
                  'tc-badge-grav--media': oc.gravidade === 'MEDIA',
                  'tc-badge-grav--baixa': oc.gravidade === 'BAIXA',
                }">{{ oc.gravidade }}</span>
                <span class="tc-gargalo-setor">{{ oc.setor }}</span>
                <span class="tc-gargalo-date">{{ formatDate(oc.dataOcorrencia) }}</span>
              </div>
              <h3 class="tc-gargalo-item__title">{{ oc.titulo }}</h3>
              <p class="tc-gargalo-item__desc">{{ oc.descricao }}</p>
              <p class="tc-gargalo-item__reporter">Registrado por: <strong>{{ oc.reportadoPor }}</strong></p>
            </div>

            <!-- Botão tátil de 48px para galeria de fotos -->
            <button
              v-if="oc.fotos && oc.fotos.length > 0"
              type="button"
              class="tc-btn-galeria"
              @click="abrirGaleria(oc.fotos)"
              :aria-label="`Ver ${oc.fotos.length} ${oc.fotos.length === 1 ? 'foto' : 'fotos'} da ocorrência`"
              :title="`${oc.fotos.length} ${oc.fotos.length === 1 ? 'foto' : 'fotos'} do desvio de qualidade`"
            >
              <ImageIcon :size="20" />
              <span>{{ oc.fotos.length }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ══════════════════════════════════════════════════════════════ -->
      <!-- KPI C · FIRST PASS YIELD (Linha 2 - metade direita - topo)  -->
      <!-- ══════════════════════════════════════════════════════════════ -->
      <section class="tc-card tc-card--fpy">
        <div class="tc-card__header">
          <div class="tc-icon-wrap tc-icon-wrap--emerald">
            <TrendingUp :size="18" />
          </div>
          <div>
            <h2 class="tc-card__title">First Pass Yield (FPY)</h2>
            <p class="tc-card__desc">Taxa de aprovação na primeira passagem de inspeção</p>
          </div>
        </div>

        <!-- Global FPY destaque -->
        <div class="tc-fpy-global">
          <div class="tc-fpy-global__number">
            <span class="tc-fpy-global__value" :class="kpiC.fpyGlobal >= 90 ? 'tc-fpy-global__value--meta' : 'tc-fpy-global__value--alert'">
              {{ kpiC.fpyGlobal }}%
            </span>
            <span class="tc-fpy-global__label">FPY Global</span>
          </div>
          <span class="tc-pill" :class="kpiC.fpyGlobal >= 90 ? 'tc-pill--emerald' : 'tc-pill--rose'">
            {{ kpiC.fpyGlobal >= 90 ? '✓ Meta ≥90%' : '⚠ Abaixo da Meta' }}
          </span>
        </div>

        <!-- Lista de setores -->
        <div class="tc-fpy-list">
          <div v-if="kpiC.setores.length === 0" class="tc-empty">
            Sem inspeções de saída registradas nos últimos 30 dias.
          </div>
          <div v-else v-for="item in kpiC.setores" :key="item.setor" class="tc-fpy-setor">
            <div class="tc-fpy-setor__info">
              <span class="tc-fpy-setor__name">{{ item.setor }}</span>
              <span class="tc-fpy-setor__pct" :class="item.fpyPercentual >= 90 ? 'tc-fpy-setor__pct--ok' : 'tc-fpy-setor__pct--nok'">
                {{ item.fpyPercentual }}%
              </span>
            </div>
            <div class="tc-bar-track">
              <div
                class="tc-bar-fill"
                :class="item.fpyPercentual >= 90 ? 'tc-bar-fill--emerald' : 'tc-bar-fill--rose'"
                :style="{ width: `${Math.min(100, item.fpyPercentual)}%` }"
              ></div>
            </div>
            <p class="tc-fpy-setor__detail">{{ item.aprovadasPrimeira }} aprovadas de {{ item.totalInspecoes > 0 ? item.totalInspecoes : item.totalRastreamentos }} inspecionadas</p>
          </div>
        </div>
      </section>

      <!-- ══════════════════════════════════════════════════════════════ -->
      <!-- KPI D · RETRABALHO POR ORIGEM (Linha 3)                      -->
      <!-- ══════════════════════════════════════════════════════════════ -->
      <section class="tc-card tc-card--retrabalho">
        <div class="tc-card__header">
          <div class="tc-icon-wrap tc-icon-wrap--orange">
            <RotateCcw :size="18" />
          </div>
          <div>
            <h2 class="tc-card__title">Índice de Retrabalho por Setor de Origem</h2>
            <p class="tc-card__desc">Ranking dos setores que geraram o maior volume de defeitos (últimos 30 dias)</p>
          </div>
          <div class="tc-retrabalho-total">
            <span class="tc-retrabalho-total__num">{{ kpiD.totalRetrabalhos }}</span>
            <span class="tc-retrabalho-total__label">casos</span>
          </div>
        </div>

        <div v-if="kpiD.setores.length === 0" class="tc-empty tc-empty--tall">
          <span>✓</span>
          <span>Nenhum retrabalho apontado nos últimos 30 dias.</span>
        </div>

        <div v-else class="tc-retrabalho-grid">
          <div
            v-for="item in kpiD.setores"
            :key="item.setorOrigem"
            class="tc-retrabalho-card"
          >
            <div class="tc-retrabalho-card__header">
              <span class="tc-retrabalho-card__setor">{{ item.setorOrigem }}</span>
              <span class="tc-retrabalho-card__count">{{ item.totalRetrabalhos }} {{ item.totalRetrabalhos === 1 ? 'caso' : 'casos' }}</span>
            </div>
            <div class="tc-bar-track tc-bar-track--lg">
              <div
                class="tc-bar-fill tc-bar-fill--orange"
                :style="{ width: `${Math.min(100, item.percentualDoTotal)}%` }"
              ></div>
            </div>
            <div class="tc-retrabalho-card__footer">
              <span>{{ item.percentualDoTotal }}% do total</span>
              <span>Tempo médio: {{ item.tempoMedioMin }} min</span>
            </div>
            <p v-if="item.tiposDivergencia" class="tc-retrabalho-card__diverg" :title="item.tiposDivergencia">
              Divergências: {{ item.tiposDivergencia }}
            </p>
          </div>
        </div>
      </section>

    </div><!-- /tc-bento -->

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!--  MODAL · GALERIA DE FOTOS DO DESVIO DE QUALIDADE           -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <Transition name="tc-fade">
      <div
        v-if="modalGaleriaFotos"
        class="tc-modal-overlay"
        @click.self="fecharGaleria"
      >
        <div class="tc-modal">
          <!-- Cabeçalho do modal -->
          <div class="tc-modal__header">
            <div class="flex items-center gap-2">
              <ImageIcon :size="18" class="text-blue-600" />
              <h3 class="tc-modal__title">
                Desvio de Qualidade — Foto {{ fotoIndexAtiva + 1 }} de {{ modalGaleriaFotos.length }}
              </h3>
            </div>
            <button class="tc-modal__close" type="button" @click="fecharGaleria" aria-label="Fechar galeria">
              <X :size="18" />
            </button>
          </div>

          <!-- Área da foto -->
          <div class="tc-modal__photo-area">
            <img
              :src="getFotoUrl(modalGaleriaFotos[fotoIndexAtiva])"
              alt="Foto do desvio de qualidade"
              class="tc-modal__img"
            />
            <!-- Navegação -->
            <button
              v-if="modalGaleriaFotos.length > 1"
              type="button"
              class="tc-modal__nav tc-modal__nav--prev"
              @click="fotoAnterior"
              aria-label="Foto anterior"
            >
              <ChevronLeft :size="22" />
            </button>
            <button
              v-if="modalGaleriaFotos.length > 1"
              type="button"
              class="tc-modal__nav tc-modal__nav--next"
              @click="fotoProxima"
              aria-label="Próxima foto"
            >
              <ChevronRight :size="22" />
            </button>
          </div>

          <!-- Thumbnails -->
          <div v-if="modalGaleriaFotos.length > 1" class="tc-modal__thumbs">
            <button
              v-for="(foto, i) in modalGaleriaFotos"
              :key="i"
              type="button"
              class="tc-modal__thumb"
              :class="{ 'tc-modal__thumb--active': fotoIndexAtiva === i }"
              @click="fotoIndexAtiva = i"
            >
              <img :src="getFotoUrl(foto)" alt="Miniatura" />
            </button>
          </div>

          <div class="tc-modal__footer">
            <button type="button" class="tc-modal__btn-close" @click="fecharGaleria">
              Fechar Visualização
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   ROOT & LAYOUT
═══════════════════════════════════════════════════════════ */
.tc-root {
  min-height: 100%;
  padding: 0 0 3rem;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1e293b;
  text-align: left;
}

/* ═══════════════════════════════════════════════════════════
   CABEÇALHO
═══════════════════════════════════════════════════════════ */
.tc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1.5rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid #e2e8f0;
  gap: 1rem;
  flex-wrap: wrap;
}

.tc-header__left {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.tc-header__icon {
  width: 2.5rem;
  height: 2.5rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  flex-shrink: 0;
}

.tc-header__title {
  font-size: 1.375rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.tc-header__sub {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.2rem 0 0;
  font-weight: 500;
}

.tc-header__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tc-live-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  border: 1px solid;
}

.tc-live-badge--on {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
}

.tc-live-badge--off {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #94a3b8;
}

.tc-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: tc-pulse 2s ease-in-out infinite;
}

.tc-live-badge--off .tc-live-dot {
  animation: none;
}

@keyframes tc-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.15); }
}

.tc-btn-refresh {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: all 0.15s ease;
}

.tc-btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

/* ═══════════════════════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════════════════════ */
.tc-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}

.tc-skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: tc-shimmer 1.8s infinite;
  border-radius: 1rem;
  height: 220px;
}

.tc-skeleton--full { grid-column: span 2; height: 180px; }
.tc-skeleton--half { grid-column: span 1; }

@keyframes tc-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ═══════════════════════════════════════════════════════════
   BENTO GRID
═══════════════════════════════════════════════════════════ */
.tc-bento {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

/* KPI A ocupa a linha inteira */
.tc-card--lead-time { grid-column: span 2; }

/* KPI D ocupa a linha inteira */
.tc-card--retrabalho { grid-column: span 2; }

@media (max-width: 900px) {
  .tc-bento { grid-template-columns: 1fr; }
  .tc-card--lead-time { grid-column: span 1; }
  .tc-card--retrabalho { grid-column: span 1; }
}

/* ═══════════════════════════════════════════════════════════
   CARDS BASE (Light Mode Puro)
═══════════════════════════════════════════════════════════ */
.tc-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  padding: 1.625rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}

.tc-card:hover {
  box-shadow: 0 6px 16px -4px rgba(0,0,0,0.07), 0 2px 6px -2px rgba(0,0,0,0.04);
  transform: translateY(-2px);
}

/* ═══════════════════════════════════════════════════════════
   CARD HEADER PATTERN
═══════════════════════════════════════════════════════════ */
.tc-card__header {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  margin-bottom: 1.375rem;
}

.tc-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid;
}

.tc-icon-wrap--blue { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
.tc-icon-wrap--amber { background: #fffbeb; border-color: #fde68a; color: #d97706; }
.tc-icon-wrap--emerald { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }
.tc-icon-wrap--orange { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }

.tc-card__title {
  font-size: 0.875rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: 0.01em;
}

.tc-card__desc {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0.2rem 0 0;
  font-weight: 500;
}

/* ═══════════════════════════════════════════════════════════
   KPI A — MÉTRICAS
═══════════════════════════════════════════════════════════ */
.tc-metrics-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 700px) {
  .tc-metrics-row { grid-template-columns: 1fr; }
}

.tc-metric-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tc-metric-box--blue { border-top: 3px solid #2563eb; }
.tc-metric-box--indigo { border-top: 3px solid #4f46e5; }
.tc-metric-box--red { border-top: 3px solid #e11d48; }

.tc-metric-box__label {
  font-size: 0.6875rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #475569;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tc-metric-box__label--sub {
  font-size: 0.6rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
}

.tc-metric-box__label--red { color: #e11d48; }

.tc-metric-box__value {
  font-size: 2rem;
  font-weight: 800;
  color: #0f172a;
  font-family: ui-monospace, monospace;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0.25rem 0 0;
}

.tc-metric-box__value--red { color: #e11d48; }

.tc-metric-box__hint {
  font-size: 0.6875rem;
  color: #94a3b8;
  margin-top: 0.25rem;
  font-weight: 500;
}

.tc-metric-box__hint--red { color: #fca5a5; }

/* ═══════════════════════════════════════════════════════════
   KPI A — CORPO (motivos + sparkline)
═══════════════════════════════════════════════════════════ */
.tc-lead-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 800px) {
  .tc-lead-body { grid-template-columns: 1fr; }
}

/* Motivos de parada */
.tc-motivos__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #374151;
  font-family: ui-monospace, monospace;
  margin-bottom: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tc-motivos__list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.tc-motivo-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.75rem 0.875rem;
}

.tc-motivo-item__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tc-motivo-item__name {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e293b;
}

.tc-motivo-item__stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.tc-motivo-item__qty {
  font-size: 0.6875rem;
  font-family: ui-monospace, monospace;
  background: #e2e8f0;
  color: #475569;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: 700;
}

.tc-motivo-item__time {
  font-size: 0.8125rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #334155;
}

.tc-motivo-item__pct {
  font-size: 0.75rem;
  font-weight: 700;
  color: #e11d48;
  font-family: ui-monospace, monospace;
}

/* Sparkline */
.tc-sparkline-wrap {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tc-sparkline__header {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #64748b;
  font-family: ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tc-sparkline__chart { flex: 1; }

.tc-svg {
  width: 100%;
  height: 90px;
  display: block;
}

.tc-sparkline__legend {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
}

/* ═══════════════════════════════════════════════════════════
   BARRAS COMUNS
═══════════════════════════════════════════════════════════ */
.tc-bar-track {
  background: #f1f5f9;
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.tc-bar-track--lg { height: 8px; }

.tc-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.tc-bar-fill--rose { background: #f43f5e; }
.tc-bar-fill--emerald { background: #10b981; }
.tc-bar-fill--orange { background: #f97316; }

/* ═══════════════════════════════════════════════════════════
   KPI B — GARGALOS
═══════════════════════════════════════════════════════════ */
.tc-badge-count {
  font-size: 0.6875rem;
  font-weight: 800;
  font-family: ui-monospace, monospace;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  border: 1px solid;
  white-space: nowrap;
  flex-shrink: 0;
}

.tc-badge-count--amber { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.tc-badge-count--green { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }

.tc-gargalos-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.tc-gargalo-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.875rem;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tc-gargalo-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.tc-gargalo-item__body { flex: 1; min-width: 0; }

.tc-gargalo-item__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
  flex-wrap: wrap;
}

.tc-badge-grav {
  font-size: 0.625rem;
  font-weight: 800;
  font-family: ui-monospace, monospace;
  padding: 0.1rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid;
}

.tc-badge-grav--critica { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.tc-badge-grav--alta { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.tc-badge-grav--media { background: #fffbeb; border-color: #fde68a; color: #b45309; }
.tc-badge-grav--baixa { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }

.tc-gargalo-setor {
  font-size: 0.6875rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #475569;
}

.tc-gargalo-date {
  font-size: 0.625rem;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
  margin-left: auto;
}

.tc-gargalo-item__title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-gargalo-item__desc {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0 0 0.375rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tc-gargalo-item__reporter {
  font-size: 0.6875rem;
  color: #94a3b8;
  margin: 0;
  font-family: ui-monospace, monospace;
}

/* Botão tátil galeria — 48px */
.tc-btn-galeria {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  color: #2563eb;
  cursor: pointer;
  font-size: 0.5625rem;
  font-weight: 800;
  font-family: ui-monospace, monospace;
  transition: all 0.15s ease;
}

.tc-btn-galeria:hover {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
  transform: scale(1.05);
}

/* ═══════════════════════════════════════════════════════════
   KPI C — FPY
═══════════════════════════════════════════════════════════ */
.tc-fpy-global {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem 1.125rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.tc-fpy-global__number { display: flex; flex-direction: column; gap: 0.125rem; }

.tc-fpy-global__value {
  font-size: 3rem;
  font-weight: 900;
  font-family: ui-monospace, monospace;
  letter-spacing: -0.04em;
  line-height: 1;
}

.tc-fpy-global__value--meta { color: #059669; }
.tc-fpy-global__value--alert { color: #e11d48; }

.tc-fpy-global__label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #64748b;
  font-family: ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tc-pill {
  font-size: 0.6875rem;
  font-weight: 800;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  border: 1px solid;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.tc-pill--emerald { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
.tc-pill--rose { background: #fff1f2; border-color: #fecdd3; color: #be123c; }

.tc-fpy-list {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.tc-fpy-setor { }

.tc-fpy-setor__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.tc-fpy-setor__name {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e293b;
}

.tc-fpy-setor__pct {
  font-size: 0.875rem;
  font-weight: 800;
  font-family: ui-monospace, monospace;
}

.tc-fpy-setor__pct--ok { color: #059669; }
.tc-fpy-setor__pct--nok { color: #e11d48; }

.tc-fpy-setor__detail {
  font-size: 0.625rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
  font-family: ui-monospace, monospace;
}

/* ═══════════════════════════════════════════════════════════
   KPI D — RETRABALHO
═══════════════════════════════════════════════════════════ */
.tc-retrabalho-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  margin-left: auto;
  flex-shrink: 0;
}

.tc-retrabalho-total__num {
  font-size: 2rem;
  font-weight: 900;
  font-family: ui-monospace, monospace;
  color: #0f172a;
  line-height: 1;
  letter-spacing: -0.03em;
}

.tc-retrabalho-total__label {
  font-size: 0.6875rem;
  color: #64748b;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}

.tc-retrabalho-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.tc-retrabalho-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  border-left: 3px solid #f97316;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.tc-retrabalho-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-left-color: #ea580c;
}

.tc-retrabalho-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}

.tc-retrabalho-card__setor {
  font-size: 0.8125rem;
  font-weight: 800;
  color: #0f172a;
  flex: 1;
  min-width: 0;
}

.tc-retrabalho-card__count {
  font-size: 0.8125rem;
  font-weight: 800;
  font-family: ui-monospace, monospace;
  color: #ea580c;
  white-space: nowrap;
  flex-shrink: 0;
}

.tc-retrabalho-card__footer {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
  margin-top: 0.375rem;
}

.tc-retrabalho-card__diverg {
  font-size: 0.625rem;
  color: #64748b;
  margin: 0.375rem 0 0;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ═══════════════════════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════════════════════ */
.tc-empty {
  text-align: center;
  padding: 1.5rem 1rem;
  font-size: 0.75rem;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 0.75rem;
}

.tc-empty--tall {
  padding: 2.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.tc-empty--tall span:first-child {
  font-size: 1.25rem;
  color: #34d399;
}

/* ═══════════════════════════════════════════════════════════
   MODAL DE GALERIA DE FOTOS
═══════════════════════════════════════════════════════════ */
.tc-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.tc-modal {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  box-shadow: 0 24px 48px -12px rgba(0,0,0,0.2);
  max-width: min(880px, 92vw);
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tc-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.125rem 1.375rem;
  border-bottom: 1px solid #f1f5f9;
}

.tc-modal__title {
  font-size: 0.9375rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  font-family: ui-monospace, monospace;
}

.tc-modal__close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #475569;
  transition: all 0.15s;
}

.tc-modal__close:hover {
  background: #fee2e2;
  border-color: #fecaca;
  color: #dc2626;
}

.tc-modal__photo-area {
  position: relative;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  max-height: 58vh;
  overflow: hidden;
}

.tc-modal__img {
  max-width: 100%;
  max-height: 58vh;
  object-fit: contain;
  display: block;
}

.tc-modal__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 2.5rem;
  height: 2.5rem;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1e293b;
  backdrop-filter: blur(4px);
  transition: all 0.15s;
}

.tc-modal__nav:hover { background: #ffffff; transform: translateY(-50%) scale(1.05); }
.tc-modal__nav--prev { left: 0.75rem; }
.tc-modal__nav--next { right: 0.75rem; }

.tc-modal__thumbs {
  display: flex;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  overflow-x: auto;
  justify-content: center;
}

.tc-modal__thumb {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.6;
  transition: all 0.15s;
}

.tc-modal__thumb--active { border-color: #2563eb; opacity: 1; transform: scale(1.08); }
.tc-modal__thumb:hover { opacity: 1; }
.tc-modal__thumb img { width: 100%; height: 100%; object-fit: cover; }

.tc-modal__footer {
  padding: 0.875rem 1.375rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
}

.tc-modal__btn-close {
  padding: 0.5rem 1.25rem;
  background: #1e293b;
  color: #ffffff;
  border: none;
  border-radius: 0.625rem;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.tc-modal__btn-close:hover { background: #334155; }

/* ═══════════════════════════════════════════════════════════
   ANIMAÇÕES DO MODAL
═══════════════════════════════════════════════════════════ */
.tc-fade-enter-active, .tc-fade-leave-active {
  transition: opacity 0.25s ease;
}
.tc-fade-enter-from, .tc-fade-leave-to {
  opacity: 0;
}
</style>
