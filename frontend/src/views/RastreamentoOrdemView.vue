<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { ArrowLeft, RotateCcw, Tag, Layers, ChevronRight, ChevronDown } from '@lucide/vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const ordemId = ref(route.params.ordemTesteId)

const ordens = ref([])
const ordem = ref(null)
const rota = ref([])
const historico = ref([])
const liveStatus = ref('DISCONNECTED')
let socket = null

// Lógica do relógio reativo para tempo em processamento
const currentTime = ref(Date.now())
let clockIntervalId = null

async function fetchOrdens() {
  try {
    const res = await api.get('/lotes')
    ordens.value = res.data
    if (!ordemId.value && ordens.value.length > 0) {
      ordemId.value = ordens.value[0].id
    }
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

  socket.on('peca:avanco', (data) => {
    if (data?.ordemTesteId === ordemId.value) {
      fetchOrdemDetails()
    }
  })
}

watch(() => route.params.ordemTesteId, (newId) => {
  if (newId) {
    ordemId.value = newId
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

  clockIntervalId = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
  if (clockIntervalId) {
    clearInterval(clockIntervalId)
  }
})

// ==========================================
// CÁLCULOS DA TIMELINE DUAL DINÂMICA
// ==========================================
function isSectorCompletedForLot(setorId, tipoLote) {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida !== null)
}

function isSectorActiveForLot(setorId, tipoLote) {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida === null)
}

function getActiveTrackingForSector(setorId) {
  return historico.value.filter(r => r.setorId === setorId && (r.status === 'EM_PROCESSO' || !r.dataSaida))
}

function getActiveTrackingForLote(tipoLote) {
  return historico.value.find(r => r.tipoLote === tipoLote && (r.status === 'EM_PROCESSO' || !r.dataSaida))
}

function getSectorEnteringDate(setorId, tipoLote) {
  const tr = historico.value.find(r => r.tipoLote === tipoLote && r.setorId === setorId)
  return tr ? new Date(tr.dataEntrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
}

function getLiveDuration(dataEntradaStr) {
  const start = new Date(dataEntradaStr).getTime()
  const diffMs = currentTime.value - start
  if (diffMs < 0) return '00h 00m 00s'

  const totalSecs = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSecs / 3600)
  const minutes = Math.floor((totalSecs % 3600) / 60)
  const seconds = totalSecs % 60

  const h = String(hours).padStart(2, '0')
  const m = String(minutes).padStart(2, '0')
  const s = String(seconds).padStart(2, '0')

  return `${h}h ${m}m ${s}s`
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="bg-slate-50 min-h-screen p-6 md:p-8 font-sans text-slate-700 flex flex-col gap-6">
    <!-- Header Enterprise -->
    <header class="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-slate-200 pb-4 gap-4">
      <div class="flex items-center gap-4">
        <button @click="router.back()" class="p-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-650 hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer transition-all shadow-sm" type="button" aria-label="Voltar">
          <ArrowLeft :size="16" />
        </button>
        <div>
          <h1 class="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Rastreamento de Lote</h1>
          <p class="text-xs text-slate-500">Acompanhamento em tempo real da Rota de Produção e status dual</p>
        </div>
      </div>

      <div class="flex items-center gap-3 self-end sm:self-center">
        <!-- Status de conexão em tempo real -->
        <div class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
          <span :class="['w-2 h-2 rounded-full', liveStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-slate-300']"></span>
          <span class="text-[9px] font-mono text-slate-600 font-bold uppercase tracking-wider">{{ liveStatus === 'CONNECTED' ? 'SINC. LIVE ATIVA' : 'SINC. OFFLINE' }}</span>
        </div>

        <button @click="fetchOrdemDetails" class="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-lg shadow-sm cursor-pointer transition-all" type="button">
          <RotateCcw :size="14" class="text-slate-500" />
          <span>Sincronizar</span>
        </button>
      </div>
    </header>

    <!-- Dropdown de seleção de ordem -->
    <div class="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
      <label for="ordem-select" class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5 shrink-0">
        <Tag :size="14" class="text-blue-650" /> Selecionar Ordem Ativa
      </label>
      <div class="relative flex-1">
        <select id="ordem-select" v-model="ordemId" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer appearance-none shadow-sm">
          <option v-for="o in ordens" :key="o.id" :value="o.id">
            {{ o.codigoBarras }} - {{ o.modelo?.nome || 'Modelo s/ nome' }} (Status: {{ o.status }})
          </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
          <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="p-12 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-center items-center gap-3">
      <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <span class="text-slate-400 text-xs font-mono">Buscando fluxo operacional dinâmico...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="!ordem" class="p-12 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
      <span class="text-slate-400 text-xs font-mono">Ordem não encontrada ou inválida no sistema.</span>
    </div>

    <!-- Detalhes do Rastreamento -->
    <div v-else class="flex flex-col gap-6">
      <!-- Info Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white border border-slate-200 border-t-4 border-t-blue-600 p-5 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">Modelo / Ficha</span>
            <span class="font-extrabold text-slate-900 block text-base leading-tight">{{ ordem.modelo?.nome || 'N/A' }}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono block mt-1">Ref: {{ ordem.modelo?.referencia || 'N/A' }}</span>
        </div>
        <div class="bg-white border border-slate-200 border-t-4 border-t-indigo-600 p-5 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">Código Barras</span>
            <span class="font-mono font-extrabold text-slate-900 block text-base tracking-wider">{{ ordem.codigoBarras }}</span>
          </div>
          <!-- Barcode style helper -->
          <div class="flex items-end h-5 gap-[1px] opacity-60 mt-3 select-none" aria-hidden="true">
            <div class="w-[2px] h-full bg-slate-900"></div>
            <div class="w-[1px] h-4 bg-slate-900"></div>
            <div class="w-[3px] h-full bg-slate-900"></div>
            <div class="w-[1px] h-3 bg-slate-900"></div>
            <div class="w-[2px] h-full bg-slate-900"></div>
            <div class="w-[1px] h-5 bg-slate-900"></div>
            <div class="w-[4px] h-full bg-slate-900"></div>
            <div class="w-[1px] h-2 bg-slate-900"></div>
            <div class="w-[2px] h-full bg-slate-900"></div>
            <div class="w-[3px] h-4 bg-slate-900"></div>
            <div class="w-[1px] h-full bg-slate-900"></div>
            <div class="w-[2px] h-3 bg-slate-900"></div>
            <div class="w-[4px] h-full bg-slate-900"></div>
            <div class="w-[1px] h-5 bg-slate-900"></div>
            <div class="w-[3px] h-full bg-slate-900"></div>
          </div>
        </div>
        <div class="bg-white border border-slate-200 border-t-4 border-t-amber-500 p-5 rounded-xl shadow-sm">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">Status Geral</span>
          <div class="mt-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wide">
              {{ ordem.status }}
            </span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 border-t-4 border-t-slate-400 p-5 rounded-xl shadow-sm">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">Data Início</span>
          <span class="text-xs text-slate-800 font-bold block mt-2">
            {{ new Date(ordem.dataInicio).toLocaleDateString() }} às {{ new Date(ordem.dataInicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </div>

      <!-- TIMELINE DUAL DINÂMICA (CONVEYOR CARD FLOW) -->
      <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <h2 class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 font-mono">
          <Layers :size="14" class="text-blue-650" /> Fluxo Secuencial da Rota (RotaModelo)
        </h2>

        <div v-if="rota.length === 0" class="text-center py-8 text-slate-400 text-xs font-mono border border-dashed border-slate-200 rounded-xl">
          Nenhuma rota associada a este modelo.
        </div>

        <div v-else class="w-full overflow-x-auto pb-4">
          <div class="flex flex-col md:flex-row md:items-center gap-4 min-w-max md:min-w-0 md:pb-2">
            <template v-for="(item, idx) in rota" :key="item.id">
              <!-- Step Card -->
              <div :class="[
                'w-full md:w-56 shrink-0 bg-white border rounded-xl p-4 shadow-sm transition-all duration-300 relative',
                isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')
                  ? 'border-blue-500 bg-blue-50/15 ring-2 ring-blue-500/10'
                  : (isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') || isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL'))
                    ? 'border-emerald-250 bg-emerald-50/5'
                    : 'border-slate-200'
              ]">
                <!-- Card Header -->
                <div class="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-100">
                  <span :class="[
                    'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
                    isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')
                      ? 'bg-blue-600 text-white'
                      : (isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') || isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL'))
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-400'
                  ]">
                    Etapa {{ String(idx + 1).padStart(2, '0') }}
                  </span>
                  
                  <!-- Pulse indicator for active state -->
                  <span v-if="isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="flex h-2 w-2 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                  </span>
                </div>

                <!-- Sector Name -->
                <h3 :class="[
                  'text-xs font-extrabold uppercase tracking-wide break-words whitespace-normal leading-tight h-8 flex items-center',
                  isSectorActiveForLot(item.setorId, 'CAIXA_TESTE') || isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')
                    ? 'text-blue-700'
                    : (isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') || isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL'))
                      ? 'text-slate-800'
                      : 'text-slate-400'
                ]">
                  {{ item.setor?.nome }}
                </h3>

                <!-- Active Batches in this sector -->
                <div class="mt-2.5 flex flex-wrap gap-1.5 h-6">
                  <!-- Caixa Teste Tag -->
                  <span v-if="isSectorActiveForLot(item.setorId, 'CAIXA_TESTE')" class="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-bold">
                    <span class="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                    Caixa Teste
                  </span>
                  <!-- Lote Principal Tag -->
                  <span v-if="isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[9px] font-bold">
                    <span class="w-1 h-1 rounded-full bg-blue-600 animate-pulse"></span>
                    Lote Principal
                  </span>
                </div>

                <!-- Live Clock / Times -->
                <div class="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5 font-mono text-[9px]">
                  <div v-for="tr in getActiveTrackingForSector(item.setorId)" :key="tr.id" class="inline-flex items-center gap-1.5 text-slate-850 font-bold bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                    <span class="font-extrabold text-[8px] text-blue-600">{{ tr.tipoLote === 'CAIXA_TESTE' ? 'CX' : 'LP' }}:</span>
                    <span>{{ getLiveDuration(tr.dataEntrada) }}</span>
                  </div>

                  <!-- Passed history -->
                  <div v-if="getSectorEnteringDate(item.setorId, 'CAIXA_TESTE') && !isSectorActiveForLot(item.setorId, 'CAIXA_TESTE')" class="text-slate-400 text-[8px]">
                    CX: {{ getSectorEnteringDate(item.setorId, 'CAIXA_TESTE') }}
                  </div>
                  <div v-if="getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL') && !isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="text-slate-400 text-[8px]">
                    LP: {{ getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL') }}
                  </div>
                </div>
              </div>

              <!-- Connector Chevron -->
              <div v-if="idx < rota.length - 1" class="flex justify-center items-center shrink-0">
                <ChevronRight class="hidden md:block text-slate-350" :size="18" />
                <ChevronDown class="block md:hidden text-slate-350 my-1" :size="18" />
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- PAINEL DE LOTES EM PROCESSO (AO VIVO) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div v-for="loteTipo in ['CAIXA_TESTE', 'LOTE_PRINCIPAL']" :key="loteTipo" :class="[
          'bg-white border rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors shadow-sm relative overflow-hidden',
          loteTipo === 'CAIXA_TESTE' ? 'border-t-4 border-t-amber-500' : 'border-t-4 border-t-blue-600'
        ]">
          <div class="flex justify-between items-start mb-4">
            <div>
              <span class="text-[9px] font-extrabold tracking-wider text-slate-400 font-mono uppercase">
                LOTE: {{ loteTipo === 'CAIXA_TESTE' ? 'CAIXA TESTE' : 'LOTE PRINCIPAL' }}
              </span>
              <h3 class="text-base font-extrabold text-slate-900 mt-1 uppercase tracking-tight">
                {{ getActiveTrackingForLote(loteTipo)?.setor?.nome || 'Finalizado ou Aguardando' }}
              </h3>
            </div>
            
            <div class="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-slate-500">
              <span :class="['w-1.5 h-1.5 rounded-full', getActiveTrackingForLote(loteTipo) ? (loteTipo === 'CAIXA_TESTE' ? 'bg-amber-500 animate-pulse' : 'bg-blue-600 animate-pulse') : 'bg-slate-200']"></span>
              <span>{{ getActiveTrackingForLote(loteTipo) ? 'ATIVO' : 'AGUARDANDO' }}</span>
            </div>
          </div>

          <div v-if="getActiveTrackingForLote(loteTipo)" class="flex flex-col gap-1 border-t border-slate-100 pt-4 mt-2">
            <span class="text-[9px] font-bold text-slate-400 font-mono uppercase">TEMPO EM PROCESSAMENTO</span>
            <div class="flex items-baseline gap-2 mt-1">
              <span :class="['text-3xl font-mono font-black tracking-tighter', loteTipo === 'CAIXA_TESTE' ? 'text-amber-600' : 'text-blue-600']">
                {{ getLiveDuration(getActiveTrackingForLote(loteTipo)?.dataEntrada) }}
              </span>
              <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">no setor</span>
            </div>
            <span class="text-[10px] font-mono text-slate-400 mt-1">
              Entrada: {{ formatDateTime(getActiveTrackingForLote(loteTipo)?.dataEntrada) }}
            </span>
          </div>
          <div v-else class="text-slate-400 text-xs font-mono border-t border-slate-100 pt-4 mt-2 py-6 flex justify-center bg-slate-50/50 border-dashed border rounded-lg">
            Nenhum processo ativo no momento.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
