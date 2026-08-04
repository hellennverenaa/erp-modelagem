<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import api from '../api/axios'
import {
  Activity,
  Layers,
  RotateCcw,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-vue-next'

interface OrdemTV {
  id: string
  codigoBarras: string
  status: string
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
  setorAtualId?: string | null
  setorAtualNome?: string | null
  historico?: Array<{
    id: string
    setorId: string
    status: string
    dataEntrada: string
    dataSaida?: string | null
    tipoLote: string
  }>
}

const loading = ref(true)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
const ordens = ref<OrdemTV[]>([])
const erroFetch = ref<string | null>(null)
let socket: Socket | null = null

async function fetchFluxoProducao() {
  try {
    erroFetch.value = null
    const res = await api.get('/lotes')
    const lotesBrutos: OrdemTV[] = res.data || []

    // Filtra ordens ativas em produção ou recém iniciadas
    const ordensAtivas = lotesBrutos.filter(
      (o) => o.status !== 'CANCELADO'
    )

    // Enriquece com historico e setores atuais
    const ordensEnriquecidas = await Promise.all(
      ordensAtivas.map(async (ordem) => {
        try {
          const histRes = await api.get(`/rastreamentos/historico/${ordem.id}`)
          const hist = histRes.data?.historico || []
          const ultimoProcesso = hist.find((h: any) => h.status === 'EM_PROCESSO') || hist[hist.length - 1]

          return {
            ...ordem,
            historico: hist,
            setorAtualId: ultimoProcesso?.setorId || null,
            setorAtualNome: ultimoProcesso?.setor?.nome || 'Aguardando Início'
          }
        } catch {
          return {
            ...ordem,
            historico: [],
            setorAtualId: null,
            setorAtualNome: 'Aguardando Início'
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
  }
}

function initWebSocket() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const socketUrl = apiUrl.replace(/\/api\/?$/, '')

  socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    withCredentials: true
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

onMounted(() => {
  fetchFluxoProducao()
  initWebSocket()
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
})
</script>

<template>
  <div class="w-full min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10 flex flex-col justify-between">
    <!-- Cabeçalho TV Real-time -->
    <header class="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-800">
      <div class="flex items-center gap-3">
        <div class="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
          <Activity :size="28" class="text-emerald-400 animate-pulse" />
        </div>
        <div>
          <h1 class="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
            Painel TV — Rastreamento Chão de Fábrica
          </h1>
          <p class="text-xs text-slate-400 font-mono">
            Monitoramento Orgânico Real-Time via WebSockets
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- Status de Conexão Socket.io -->
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
          <span>{{ liveStatus === 'CONNECTED' ? 'WEBSOCKET ATIVO' : 'CONEXÃO OFF' }}</span>
        </div>

        <button
          @click="fetchFluxoProducao"
          class="p-2.5 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Sincronizar Manualmente"
          type="button"
        >
          <RotateCcw :size="18" />
        </button>
      </div>
    </header>

    <!-- Conteúdo Central / Swimlanes -->
    <main class="flex-1 my-6 flex flex-col justify-center">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-4">
        <div class="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p class="text-slate-400 font-mono text-sm uppercase tracking-widest">
          Sincronizando fluxo com banco PostgreSQL...
        </p>
      </div>

      <!-- Erro State -->
      <div v-else-if="erroFetch" class="p-8 border border-red-500/30 bg-red-950/20 rounded-3xl text-center max-w-xl mx-auto">
        <AlertCircle :size="36" class="text-red-400 mx-auto mb-3" />
        <h3 class="text-lg font-bold text-red-200 uppercase">Falha na Sincronização</h3>
        <p class="text-sm text-red-300 mt-1 font-mono">{{ erroFetch }}</p>
        <button
          @click="fetchFluxoProducao"
          class="mt-4 px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
          type="button"
        >
          Tentar Novamente
        </button>
      </div>

      <!-- Vazio -->
      <div v-else-if="ordens.length === 0" class="p-12 border border-dashed border-slate-800 bg-slate-900/40 rounded-3xl text-center max-w-xl mx-auto">
        <Layers :size="40" class="text-slate-600 mx-auto mb-3" />
        <h3 class="text-base font-bold text-slate-300 uppercase">Nenhuma Ordem em Produção</h3>
        <p class="text-xs text-slate-500 mt-1 font-mono">
          As ordens ativas aparecerão automaticamente neste painel assim que iniciadas.
        </p>
      </div>

      <!-- Lista de Raias de Produção -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="ordem in ordens"
          :key="ordem.id"
          class="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between shadow-xl"
        >
          <div>
            <!-- Cabeçalho do Card -->
            <div class="flex items-start justify-between gap-2 mb-4">
              <div>
                <span class="text-xs font-mono font-bold text-emerald-400 tracking-wider">
                  {{ ordem.codigoBarras }}
                </span>
                <h2 class="text-xl font-black text-white leading-tight mt-0.5">
                  {{ ordem.modelo?.nome || 'Modelo sem Nome' }}
                </h2>
              </div>
              <span class="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-black tracking-widest text-slate-300 uppercase">
                {{ ordem.status }}
              </span>
            </div>

            <!-- Setor Atual Ativo -->
            <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-4">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Etapa Atual no Chão de Fábrica
              </span>
              <div class="flex items-center gap-2">
                <Clock :size="16" class="text-emerald-400 shrink-0" />
                <span class="text-sm font-extrabold text-slate-100 uppercase tracking-wide">
                  {{ ordem.setorAtualNome }}
                </span>
              </div>
            </div>

            <!-- Histórico Recente -->
            <div v-if="ordem.historico && ordem.historico.length > 0" class="space-y-1.5">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Últimas Bipagens
              </span>
              <div
                v-for="h in ordem.historico.slice(-3)"
                :key="h.id"
                class="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/60"
              >
                <span class="flex items-center gap-1.5 text-slate-300 font-sans font-semibold">
                  <CheckCircle2 :size="12" class="text-emerald-500" />
                  {{ h.tipoLote }}
                </span>
                <span>{{ new Date(h.dataEntrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</span>
              </div>
            </div>
          </div>

          <!-- Footer Card -->
          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-500">
            <span>ISO 9001 COMPLIANT</span>
            <span class="text-emerald-400 font-bold">REATIVO</span>
          </div>
        </div>
      </div>
    </main>

    <!-- Rodapé TV -->
    <footer class="pt-4 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2 text-xs font-mono text-slate-500">
      <span>SISTEMA ERP MODELAGEM — CHÃO DE FÁBRICA V5.1</span>
      <span>ATUALIZAÇÃO AUTOMÁTICA VIA WEBSOCKETS</span>
    </footer>
  </div>
</template>
