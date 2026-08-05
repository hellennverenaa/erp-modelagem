<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { io, Socket } from 'socket.io-client'
import api from '../api/axios'
import { gsap } from 'gsap'
import {
  Activity,
  Layers,
  RotateCcw,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  Box,
  PackageCheck
} from 'lucide-vue-next'

interface RastreamentoItem {
  id: string
  setorId: string
  setor?: { id: string; nome: string; tipoSetor?: string }
  tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL'
  status: string
  dataEntrada: string
  dataSaida?: string | null
}

interface OrdemTV {
  id: string
  codigoBarras: string
  status: string
  possuiCaixaTeste?: boolean
  modelo?: {
    id: string
    nome: string
    referencia?: string
    rotas?: Array<{
      id: string
      ordem: number
      setorId: string
      setor?: { id: string; nome: string }
    }>
  }
  rotasCalculadas?: Array<{
    setorId: string
    nome: string
    ordem: number
  }>
  setorAtualCxNome?: string | null
  setorAtualLpNome?: string | null
  historico?: RastreamentoItem[]
}

const loading = ref(true)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
const ordens = ref<OrdemTV[]>([])
const erroFetch = ref<string | null>(null)
let socket: Socket | null = null

// Conexões SVG e referências GSAP
const containerRef = ref<HTMLElement | null>(null)
const cardRefs = ref<Record<string, HTMLElement>>({})

function setCardRef(el: any, key: string) {
  if (el) {
    cardRefs.value[key] = el
  }
}

async function fetchFluxoProducao() {
  try {
    erroFetch.value = null
    const res = await api.get('/lotes')
    const lotesBrutos: any[] = res.data || []

    const ordensAtivas = lotesBrutos.filter(
      (o) => o.status !== 'CANCELADO'
    )

    const ordensEnriquecidas: OrdemTV[] = await Promise.all(
      ordensAtivas.map(async (ordem) => {
        try {
          const [histRes, loteDetalheRes] = await Promise.all([
            api.get(`/rastreamentos/historico/${ordem.id}`),
            api.get(`/lotes/${ordem.id}`)
          ])

          const hist: RastreamentoItem[] = histRes.data?.historico || []
          const loteCompleto = loteDetalheRes.data || {}

          // Rotas ordenadas do modelo
          const rotasBrutas = loteCompleto.modelo?.rotas || (loteCompleto.modelo as any)?.rota_modelo || []
          const rotasCalculadas = Array.isArray(rotasBrutas)
            ? rotasBrutas
                .map((r: any) => ({
                  setorId: r.setorId || r.setor?.id,
                  nome: r.setor?.nome || 'Setor',
                  ordem: r.ordem || 1
                }))
                .sort((a: any, b: any) => a.ordem - b.ordem)
            : []

          // Ativo em Caixa Teste
          const histCx = hist.filter(h => h.tipoLote === 'CAIXA_TESTE')
          const ativoCx = histCx.find(h => !h.dataSaida) || histCx[histCx.length - 1]

          // Ativo em Lote Principal
          const histLp = hist.filter(h => h.tipoLote === 'LOTE_PRINCIPAL')
          const ativoLp = histLp.find(h => !h.dataSaida) || histLp[histLp.length - 1]

          const temCaixaTeste = (loteCompleto.modelo as any)?.possuiCaixaTeste || histCx.length > 0 || ordem.possuiCaixaTeste

          return {
            ...ordem,
            possuiCaixaTeste: Boolean(temCaixaTeste),
            rotasCalculadas,
            historico: hist,
            setorAtualCxNome: ativoCx?.setor?.nome || null,
            setorAtualLpNome: ativoLp?.setor?.nome || null
          }
        } catch {
          return {
            ...ordem,
            possuiCaixaTeste: false,
            rotasCalculadas: [],
            historico: [],
            setorAtualCxNome: null,
            setorAtualLpNome: null
          }
        }
      })
    )

    ordens.value = ordensEnriquecidas
  } catch (err: any) {
    console.error('[TVRastreamentoView] Erro ao carregar fluxo:', err)
    erroFetch.value = 'Falha ao sincronizar ordens com o servidor.'
  } finally {
    loading.value = false
    triggerLayoutAnimation()
  }
}

function triggerLayoutAnimation() {
  nextTick(() => {
    gsap.from('.op-swimlane', {
      y: 30,
      opacity: 0,
      stagger: 0.15,
      duration: 0.8,
      ease: 'power3.out'
    })
  })
}

function handleResize() {
  triggerLayoutAnimation()
}

function initWebSocket() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const socketUrl = apiUrl.replace(/\/api\/?$/, '')
  const token = localStorage.getItem('erp_token') || localStorage.getItem('token') || ''

  socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    withCredentials: true,
    auth: { token }
  })

  socket.on('connect', () => {
    liveStatus.value = 'CONNECTED'
  })

  socket.on('disconnect', () => {
    liveStatus.value = 'DISCONNECTED'
  })

  socket.on('rastreamento:atualizado', () => {
    fetchFluxoProducao()
  })

  socket.on('peca:avanco', () => {
    fetchFluxoProducao()
  })
}

function isSectorActiveInTrack(ordem: OrdemTV, setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL'): boolean {
  if (!ordem.historico) return false
  return ordem.historico.some(h => h.tipoLote === tipoLote && h.setorId === setorId && !h.dataSaida)
}

function isSectorCompletedInTrack(ordem: OrdemTV, setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL'): boolean {
  if (!ordem.historico) return false
  return ordem.historico.some(h => h.tipoLote === tipoLote && h.setorId === setorId && Boolean(h.dataSaida))
}

onMounted(() => {
  fetchFluxoProducao()
  initWebSocket()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="w-full min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10 flex flex-col justify-between select-none">
    <!-- Cabeçalho TV Real-time Multiórdens -->
    <header class="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-800">
      <div class="flex items-center gap-3">
        <div class="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
          <Activity :size="28" class="text-emerald-400 animate-pulse" />
        </div>
        <div>
          <h1 class="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
            Torre TV — Rastreamento Multiórdens
          </h1>
          <p class="text-xs text-slate-400 font-mono">
            Chão de Fábrica Real-Time — Raias Paralelas de Produção ISO
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- Badge Socket Connection -->
        <div
          :class="[
            'px-4 py-2 rounded-full border text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2',
            liveStatus === 'CONNECTED'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
              : 'bg-red-950/80 border-red-500/40 text-red-400'
          ]"
        >
          <Wifi v-if="liveStatus === 'CONNECTED'" :size="14" class="animate-pulse" />
          <WifiOff v-else :size="14" />
          <span>{{ liveStatus === 'CONNECTED' ? 'LIVE SYNC ATIVO' : 'OFFLINE' }}</span>
        </div>

        <button
          @click="fetchFluxoProducao"
          class="p-2.5 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Recarregar Raias"
          type="button"
        >
          <RotateCcw :size="18" />
        </button>
      </div>
    </header>

    <!-- Conteúdo Central / Raias Horizontais Paralelas -->
    <main ref="containerRef" class="flex-1 my-6 flex flex-col justify-center gap-8 overflow-x-auto">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-4">
        <div class="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p class="text-slate-400 font-mono text-sm uppercase tracking-widest">
          Alimentando raias de produção via PostgreSQL...
        </p>
      </div>

      <!-- Error State -->
      <div v-else-if="erroFetch" class="p-8 border border-red-500/30 bg-red-950/20 rounded-3xl text-center max-w-xl mx-auto">
        <AlertCircle :size="36" class="text-red-400 mx-auto mb-3" />
        <h3 class="text-lg font-bold text-red-200 uppercase">Falha na Conexão</h3>
        <p class="text-sm text-red-300 mt-1 font-mono">{{ erroFetch }}</p>
        <button
          @click="fetchFluxoProducao"
          class="mt-4 px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
          type="button"
        >
          Reconectar
        </button>
      </div>

      <!-- Vazio -->
      <div v-else-if="ordens.length === 0" class="p-12 border border-dashed border-slate-800 bg-slate-900/40 rounded-3xl text-center max-w-xl mx-auto">
        <Layers :size="40" class="text-slate-600 mx-auto mb-3" />
        <h3 class="text-base font-bold text-slate-300 uppercase">Nenhuma Ordem de Teste em Andamento</h3>
        <p class="text-xs text-slate-500 mt-1 font-mono">
          As raias de produção aparecerão em tempo real conforme ordens forem iniciadas.
        </p>
      </div>

      <!-- Grid de Raias (Swimlanes por OP) -->
      <div v-else class="space-y-8">
        <div
          v-for="ordem in ordens"
          :key="ordem.id"
          class="op-swimlane bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl relative"
        >
          <!-- Identificador da OP -->
          <div class="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800/80">
            <div class="flex items-center gap-3">
              <span class="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold uppercase">
                {{ ordem.codigoBarras }}
              </span>
              <h2 class="text-lg md:text-xl font-black text-white">
                {{ ordem.modelo?.nome || 'Modelo sem Nome' }}
              </h2>
              <span v-if="ordem.modelo?.referencia" class="text-xs font-mono text-slate-400">
                Ref: {{ ordem.modelo.referencia }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span v-if="ordem.possuiCaixaTeste" class="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-extrabold tracking-widest uppercase">
                Dual Track (Caixa Teste + Lote)
              </span>
              <span class="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-black tracking-widest text-slate-300 uppercase">
                {{ ordem.status }}
              </span>
            </div>
          </div>

          <!-- Trilhas de Rota Produtiva -->
          <div class="space-y-4">
            <!-- Trilha 1: Caixa Teste (Se Habilitada) -->
            <div v-if="ordem.possuiCaixaTeste" class="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4">
              <div class="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
                <Box :size="14" />
                <span>Trilha 1 — Caixa Teste (Fast Track)</span>
                <span v-if="ordem.setorAtualCxNome" class="text-slate-400 text-[11px] font-mono ml-auto">
                  Ativo em: {{ ordem.setorAtualCxNome }}
                </span>
              </div>

              <!-- Passos Dinâmicos da Rota para CX -->
              <div class="flex flex-wrap items-center gap-3">
                <div
                  v-for="(passo, idx) in ordem.rotasCalculadas"
                  :key="`cx-${ordem.id}-${passo.setorId}`"
                  :ref="el => setCardRef(el, `cx-${ordem.id}-${passo.setorId}`)"
                  :class="[
                    'flex-1 min-w-[130px] p-3 rounded-xl border text-center transition-all duration-300',
                    isSectorActiveInTrack(ordem, passo.setorId, 'CAIXA_TESTE')
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-black shadow-lg scale-105 animate-pulse'
                      : isSectorCompletedInTrack(ordem, passo.setorId, 'CAIXA_TESTE')
                        ? 'bg-slate-900 border-emerald-500/40 text-emerald-400 font-bold opacity-80'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  ]"
                >
                  <span class="text-[9px] font-mono block text-slate-400 uppercase mb-0.5">Etapa {{ idx + 1 }}</span>
                  <span class="text-xs font-bold leading-tight block">{{ passo.nome }}</span>
                </div>
              </div>
            </div>

            <!-- Trilha 2: Lote Principal -->
            <div class="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-4">
              <div class="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">
                <PackageCheck :size="14" />
                <span>Trilha {{ ordem.possuiCaixaTeste ? '2' : '1' }} — Lote Principal</span>
                <span v-if="ordem.setorAtualLpNome" class="text-slate-400 text-[11px] font-mono ml-auto">
                  Ativo em: {{ ordem.setorAtualLpNome }}
                </span>
              </div>

              <!-- Passos Dinâmicos da Rota para LP -->
              <div class="flex flex-wrap items-center gap-3">
                <div
                  v-for="(passo, idx) in ordem.rotasCalculadas"
                  :key="`lp-${ordem.id}-${passo.setorId}`"
                  :ref="el => setCardRef(el, `lp-${ordem.id}-${passo.setorId}`)"
                  :class="[
                    'flex-1 min-w-[130px] p-3 rounded-xl border text-center transition-all duration-300',
                    isSectorActiveInTrack(ordem, passo.setorId, 'LOTE_PRINCIPAL')
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200 font-black shadow-lg scale-105 animate-pulse'
                      : isSectorCompletedInTrack(ordem, passo.setorId, 'LOTE_PRINCIPAL')
                        ? 'bg-slate-900 border-emerald-500/40 text-emerald-400 font-bold opacity-80'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  ]"
                >
                  <span class="text-[9px] font-mono block text-slate-400 uppercase mb-0.5">Etapa {{ idx + 1 }}</span>
                  <span class="text-xs font-bold leading-tight block">{{ passo.nome }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Rodapé TV Multiórdens -->
    <footer class="pt-4 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2 text-xs font-mono text-slate-500">
      <span>TORRE TV ERA 5.1 — MONITORAMENTO PARALELO MULTIÓRDENS ISO</span>
      <span>ATUALIZADO VIA WEBSOCKETS (COM AUTHENTICATED HANDSHAKE)</span>
    </footer>
  </div>
</template>
