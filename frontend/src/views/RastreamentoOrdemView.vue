<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { ArrowLeft, RotateCcw, Tag, Layers } from '@lucide/vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const ordemId = ref(route.params.ordemTesteId as string)

const ordens = ref<any[]>([])
const ordem = ref<any>(null)
const rota = ref<any[]>([])
const historico = ref<any[]>([])
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

async function fetchOrdens() {
  try {
    const res = await api.get('/lotes')
    ordens.value = res.data
  } catch (error) {
    console.error('Erro ao buscar ordens de teste:', error)
  }
}

async function fetchOrdemDetails() {
  if (!ordemId.value) return
  loading.value = true
  try {
    const [ordemRes, histRes] = await Promise.all([
      api.get(`/lotes/${ordemId.value}`),
      api.get(`/rastreamentos/historico/${ordemId.value}`)
    ])
    ordem.value = ordemRes.data
    historico.value = histRes.data.historico

    if (ordem.value?.modeloId) {
      const rotaRes = await api.get(`/rotas/${ordem.value.modeloId}`)
      rota.value = rotaRes.data.rota || []
    }
  } catch (error) {
    console.error('Erro ao buscar dados de rastreamento:', error)
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
  })

  socket.on('disconnect', () => {
    liveStatus.value = 'DISCONNECTED'
  })

  socket.on('peca:avanco', (data: any) => {
    if (data.ordemTesteId === ordemId.value) {
      fetchOrdemDetails()
    }
  })
}

watch(() => route.params.ordemTesteId, (newId) => {
  if (newId) {
    ordemId.value = newId as string
    fetchOrdemDetails()
  }
})

watch(ordemId, (newId) => {
  if (newId && newId !== route.params.ordemTesteId) {
    router.push({ name: 'rastreamento-ordem', params: { ordemTesteId: newId } })
  }
})

onMounted(() => {
  fetchOrdens()
  fetchOrdemDetails()
  initWebSocket()
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
})

// ==========================================
// CÁLCULOS DA TIMELINE DUAL DINÂMICA
// ==========================================
function isSectorCompletedForLot(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida !== null)
}

function isSectorActiveForLot(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida === null)
}

function getSectorEnteringDate(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  const tr = historico.value.find(r => r.tipoLote === tipoLote && r.setorId === setorId)
  return tr ? new Date(tr.dataEntrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
}
</script>

<template>
  <div class="rastreamento-ordem">
    <!-- Header brutalista / Light Mode -->
    <header class="dashboard-header border-b border-slate-200 pb-6 mb-8 flex justify-between items-center">
      <div class="header-left flex items-center gap-4">
        <button @click="router.back()" class="btn-back p-2 hover:bg-slate-100 rounded-lg border border-slate-200" type="button" aria-label="Voltar">
          <ArrowLeft :size="16" class="text-slate-600" />
        </button>
        <div>
          <h1 class="text-2xl font-bold text-slate-900">RASTREAMENTO CHÃO DE FÁBRICA</h1>
          <p class="text-sm text-slate-500">Acompanhamento em tempo real da Rota de Produção e status dual</p>
        </div>
      </div>

      <div class="header-right flex items-center gap-3">
        <!-- Status de conexão em tempo real -->
        <div class="status-indicator border border-slate-200 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white">
          <span :class="['status-dot w-2 h-2 rounded-full', liveStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-slate-400']"></span>
          <span class="status-text text-xs text-slate-500 font-mono">{{ liveStatus === 'CONNECTED' ? 'SINC. LIVE ATIVA' : 'SINC. OFFLINE' }}</span>
        </div>

        <button @click="fetchOrdemDetails" class="btn-refresh text-xs flex items-center gap-1.5 px-3 py-2 text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm" type="button">
          <RotateCcw :size="12" class="text-slate-600" />
          <span>Sincronizar</span>
        </button>
      </div>
    </header>

    <!-- Dropdown de seleção de ordem -->
    <div class="mb-6 p-4 bg-white/70 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm flex items-center gap-4">
      <label for="ordem-select" class="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Tag :size="14" /> Selecionar Ordem Ativa:
      </label>
      <select id="ordem-select" v-model="ordemId" class="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option v-for="o in ordens" :key="o.id" :value="o.id">
          {{ o.codigoBarras }} - {{ o.modelo?.nome || 'Modelo s/ nome' }} (Status: {{ o.status }})
        </option>
      </select>
    </div>

    <div v-if="loading" class="p-8 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm flex justify-center items-center">
      <span class="text-slate-500 text-sm font-mono">Carregando detalhes do fluxo produtivo...</span>
    </div>

    <div v-else-if="!ordem" class="p-8 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm text-center">
      <span class="text-slate-500 text-sm">Ordem não encontrada ou inválida.</span>
    </div>

    <div v-else class="space-y-6">
      <!-- Info Card -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white/70 backdrop-blur border border-slate-200/60 p-4 rounded-xl shadow-sm">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Modelo / Ficha</span>
          <span class="font-semibold text-slate-800 block text-sm">{{ ordem.modelo?.nome || 'N/A' }}</span>
          <span class="text-xs text-slate-500 font-mono block">{{ ordem.modelo?.referencia || 'N/A' }}</span>
        </div>
        <div class="bg-white/70 backdrop-blur border border-slate-200/60 p-4 rounded-xl shadow-sm">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Código Barras</span>
          <span class="font-mono font-semibold text-slate-800 text-sm block">{{ ordem.codigoBarras }}</span>
        </div>
        <div class="bg-white/70 backdrop-blur border border-slate-200/60 p-4 rounded-xl shadow-sm">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status Lote</span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 mt-1">
            {{ ordem.status }}
          </span>
        </div>
        <div class="bg-white/70 backdrop-blur border border-slate-200/60 p-4 rounded-xl shadow-sm">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Data Início</span>
          <span class="text-xs text-slate-700 block mt-1">
            {{ new Date(ordem.dataInicio).toLocaleDateString() }} às {{ new Date(ordem.dataInicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </div>

      <!-- TIMELINE DUAL DINÂMICA -->
      <div class="bg-white/70 backdrop-blur border border-slate-200/60 p-8 rounded-2xl shadow-sm">
        <h2 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-1.5">
          <Layers :size="14" /> Linha do Tempo de Produção (RotaModelo)
        </h2>

        <div v-if="rota.length === 0" class="text-center py-6 text-slate-400 text-sm font-mono">
          Nenhuma rota associada a este modelo.
        </div>

        <div v-else class="stepper-scroll-container">
          <div class="stepper-track-horizontal flex items-center w-full min-w-max py-10">
            <template v-for="(item, idx) in rota" :key="item.id">
              <!-- Step node -->
              <div class="step-node-wrapper flex items-center">
                <div class="step-node flex flex-col items-center relative px-4 min-w-[120px]">
                  
                  <!-- Indicadores flutuantes superiores para Caixa Teste e Lote Principal -->
                  <div class="floating-indicators-container absolute -top-8 flex flex-col items-center gap-1">
                    <!-- Caixa Teste Indicator -->
                    <span v-if="isSectorActiveForLot(item.setorId, 'CAIXA_TESTE')" class="badge-lot badge-lot--cx text-[10px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full shadow-sm animate-bounce-slow">
                      CX
                    </span>
                    <!-- Lote Principal Indicator -->
                    <span v-if="isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="badge-lot badge-lot--lp text-[10px] font-bold text-white bg-green-600 px-2 py-0.5 rounded-full shadow-sm animate-bounce-slow">
                      LP
                    </span>
                  </div>

                  <!-- Círculo do Setor -->
                  <div :class="[
                    'node-circle w-10 h-10 rounded-full flex items-center justify-center border-2 font-mono text-sm z-10 transition-all duration-300',
                    isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')
                      ? 'border-blue-600 bg-blue-50 text-blue-800 scale-110 shadow-md font-bold'
                      : (isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') || isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL'))
                        ? 'border-slate-400 bg-slate-100 text-slate-600'
                        : 'border-slate-200 bg-white text-slate-400'
                  ]">
                    {{ idx + 1 }}
                  </div>

                  <!-- Nome do Setor / Detalhes de Entrada -->
                  <span :class="[
                    'node-label text-xs font-semibold mt-2.5 text-center max-w-[100px] block',
                    isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')
                      ? 'text-blue-600 font-bold'
                      : 'text-slate-700'
                  ]">
                    {{ item.setor?.nome }}
                  </span>

                  <!-- Datas/Horas de Entrada em cada Lote -->
                  <div class="text-[9px] font-mono text-slate-400 text-center mt-1 space-y-0.5">
                    <div v-if="getSectorEnteringDate(item.setorId, 'CAIXA_TESTE')" class="text-blue-500">
                      CX: {{ getSectorEnteringDate(item.setorId, 'CAIXA_TESTE') }}
                    </div>
                    <div v-if="getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL')" class="text-green-500">
                      LP: {{ getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL') }}
                    </div>
                  </div>
                </div>

                <!-- Conector entre nós (não renderiza no último nó) -->
                <div v-if="idx < rota.length - 1" :class="[
                  'step-connector h-0.5 w-16 -mx-2 transition-all duration-300',
                  (isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') && isSectorCompletedForLot(rota[idx+1].setorId, 'CAIXA_TESTE')) ||
                  (isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL') && isSectorCompletedForLot(rota[idx+1].setorId, 'LOTE_PRINCIPAL'))
                    ? 'bg-slate-400'
                    : 'bg-slate-200'
                ]"></div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rastreamento-ordem {
  width: 100%;
}

.stepper-scroll-container {
  width: 100%;
  overflow-x: auto;
  padding: 0 1rem;
}

.stepper-scroll-container::-webkit-scrollbar {
  height: 6px;
}

.stepper-scroll-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.stepper-scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.stepper-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
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
</style>
