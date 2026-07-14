<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { ArrowLeft, RotateCcw, Tag, Layers, Maximize, X } from '@lucide/vue'
import { gsap } from 'gsap'

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

// Estados da Linha SVG Animada
const containerRef = ref<HTMLElement | null>(null)
const activeLineRef = ref<SVGPathElement | null>(null)
const guidePathD = ref('')
const activePathD = ref('')
const cardRefs = ref<any[]>([])

// Controle do Modo TV e Relógio
const isTvMode = ref(false)
const now = ref(new Date())
let timerInterval: any = null

function startTimer() {
  timerInterval = setInterval(() => {
    now.value = new Date()
  }, 1000)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
}

function setCardRef(el: any, idx: number) {
  if (el) {
    cardRefs.value[idx] = el
  }
}

function updatePaths() {
  if (!containerRef.value || cardRefs.value.length === 0 || rota.value.length === 0) return
  const containerRect = containerRef.value.getBoundingClientRect()
  
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < rota.value.length; i++) {
    const el = cardRefs.value[i]
    if (el) {
      const rect = el.getBoundingClientRect()
      // Coordenadas relativas ao container pai
      const x = rect.left - containerRect.left + rect.width / 2
      const y = rect.top - containerRect.top + rect.height / 2
      points.push({ x, y })
    }
  }
  
  if (points.length === 0) return
  
  // Função para criar curva Bézier suave entre dois pontos
  const createCurve = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    const dx = Math.abs(p2.x - p1.x)
    const dy = Math.abs(p2.y - p1.y)
    // Ajusta os pontos de controle para serem orgânicos, dependendo se o fluxo quebrou linha
    const cx1 = (p1.x + p2.x) / 2
    const cy1 = p1.y + (dy > dx ? (p2.y - p1.y) * 0.2 : 0)
    const cx2 = cx1
    const cy2 = p2.y - (dy > dx ? (p2.y - p1.y) * 0.2 : 0)
    return ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`
  }

  // Constrói o caminho guia (pontilhado de fundo)
  let gPath = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    gPath += createCurve(points[i-1], points[i])
  }
  guidePathD.value = gPath
  
  // Localiza o setor ativo
  const activeIdx = rota.value.findIndex(item => isSectorActive(item.setorId))
  
  if (activeIdx !== -1) {
    let aPath = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i <= activeIdx; i++) {
      aPath += createCurve(points[i-1], points[i])
    }
    activePathD.value = aPath
  } else {
    // Se não há ativo, desenha até o fim se concluído
    const allCompleted = rota.value.every(item => 
      isSectorCompletedForLot(item.setorId, 'CAIXA_TESTE') || 
      isSectorCompletedForLot(item.setorId, 'LOTE_PRINCIPAL')
    )
    if (allCompleted) {
      activePathD.value = gPath
    } else {
      activePathD.value = ''
    }
  }
  
  // Executa animação com GSAP (física fluida)
  nextTick(() => {
    animateActiveLine()
  })
}

function animateActiveLine() {
  const lineEl = activeLineRef.value
  if (!lineEl) return
  
  const length = lineEl.getTotalLength()
  gsap.killTweensOf(lineEl)
  
  gsap.set(lineEl, {
    strokeDasharray: length,
    strokeDashoffset: length
  })
  
  gsap.to(lineEl, {
    strokeDashoffset: 0,
    duration: 2.5,
    ease: 'power4.out'
  })
}

async function triggerPathUpdate() {
  await nextTick()
  setTimeout(() => {
    updatePaths()
  }, 250) // leve atraso para os cards deitarem
}

async function fetchOrdens() {
  try {
    const res = await api.get('/lotes')
    ordens.value = res.data
    if (!ordemId.value && ordens.value.length > 0) {
      ordemId.value = ordens.value[0].id
      fetchOrdemDetails()
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
    triggerPathUpdate()
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

watch(isTvMode, () => {
  cardRefs.value = []
  triggerPathUpdate()
  
  // Se entrar no modo TV, aplica uma animação de entrada pros cards
  if (isTvMode.value) {
    nextTick(() => {
      gsap.from('.tv-card', {
        y: 40,
        opacity: 0,
        stagger: 0.1,
        duration: 1,
        ease: 'power3.out'
      })
      gsap.from('.tv-header', {
        y: -40,
        opacity: 0,
        duration: 1.2,
        ease: 'power4.out'
      })
    })
  }
})

onMounted(() => {
  fetchOrdens()
  fetchOrdemDetails()
  initWebSocket()
  startTimer()
  window.addEventListener('resize', updatePaths)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
  stopTimer()
  window.removeEventListener('resize', updatePaths)
})

// CÁLCULOS
function isSectorCompletedForLot(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida !== null)
}

function isSectorActiveForLot(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  return historico.value.some(r => r.tipoLote === tipoLote && r.setorId === setorId && r.dataSaida === null)
}

function isSectorActive(setorId: string) {
  return isSectorActiveForLot(setorId, 'CAIXA_TESTE') || isSectorActiveForLot(setorId, 'LOTE_PRINCIPAL')
}

function getSectorEnteringDate(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  const tr = historico.value.find(r => r.tipoLote === tipoLote && r.setorId === setorId)
  return tr ? new Date(tr.dataEntrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
}

function getLiveTime(setorId: string, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL') {
  const tr = historico.value.find(r => r.tipoLote === tipoLote && r.setorId === setorId && r.status === 'EM_PROCESSO')
  if (!tr || !tr.dataEntrada) return null
  
  const entryDate = new Date(tr.dataEntrada)
  const diffMs = now.value.getTime() - entryDate.getTime()
  if (diffMs < 0) return '00:00:00'
  
  const diffSecs = Math.floor(diffMs / 1000)
  const hours = Math.floor(diffSecs / 3600).toString().padStart(2, '0')
  const minutes = Math.floor((diffSecs % 3600) / 60).toString().padStart(2, '0')
  const seconds = (diffSecs % 60).toString().padStart(2, '0')
  
  return `${hours}:${minutes}:${seconds}`
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
    <!-- MODO TV (Overlay Fullscreen) -->
    <div 
      v-if="isTvMode" 
      class="fixed inset-0 z-50 bg-slate-50/90 backdrop-blur-3xl flex flex-col w-full min-h-screen overflow-hidden p-8 md:p-16 justify-between" 
      role="dialog" 
      aria-modal="true" 
      aria-label="Modo TV Rastreamento"
    >
      <!-- Tipografia Respirável Extragrande no fundo -->
      <div class="absolute -top-12 -left-12 opacity-5 pointer-events-none select-none z-0">
        <h1 class="text-[12rem] font-extrabold tracking-tighter text-slate-900 leading-[0.8] mix-blend-multiply">
          LIVE<br/>TRACKING
        </h1>
      </div>

      <!-- Cabeçalho TV -->
      <div class="tv-header relative z-10 flex justify-between items-start mb-8">
        <div>
          <h2 class="text-6xl md:text-[6rem] font-extrabold tracking-tighter text-slate-900 leading-none">
            {{ ordem?.codigoBarras || 'TV RASTREAMENTO' }}
          </h2>
          <div v-if="ordem" class="mt-6 flex flex-wrap items-center gap-4 text-xl text-slate-600 font-medium tracking-tight">
            <span class="px-5 py-2 rounded-full bg-white/60 backdrop-blur-md border border-white/40 shadow-xs">
              MODELO: <strong class="text-slate-900">{{ ordem.modelo?.nome || 'N/A' }}</strong>
            </span>
            <span class="inline-flex items-center px-5 py-2 font-bold bg-blue-600 text-white rounded-full tracking-widest uppercase shadow-xs">
              {{ ordem.status }}
            </span>
          </div>
        </div>
        <button 
          @click="isTvMode = false" 
          class="p-4 bg-white/60 backdrop-blur-md border border-white/40 hover:bg-white text-slate-900 transition-all rounded-full cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-600 hover:scale-105 active:scale-95 shadow-xs"
          type="button" 
          aria-label="Sair do Modo TV"
        >
          <X :size="32" stroke-width="2.5" />
        </button>
      </div>

      <!-- Área Central da Timeline -->
      <div v-if="loading" class="flex-1 flex justify-center items-center relative z-10">
        <span class="text-slate-400 text-xl font-medium tracking-widest">Carregando Fluxo Orgânico...</span>
      </div>
      <div v-else-if="!ordem" class="flex-1 flex justify-center items-center relative z-10">
        <span class="text-slate-400 text-xl tracking-widest">Ordem Inválida</span>
      </div>
      <div v-else class="flex-1 my-auto py-12 overflow-hidden relative z-10">
        <div ref="containerRef" class="relative w-full h-full min-h-[500px]">
          <!-- Linhas SVG Animadas com Curvas Bézier -->
          <svg class="absolute inset-0 pointer-events-none w-full h-full">
            <!-- Glow da linha ativa para efeito tátil e profundidade -->
            <path 
              v-if="activePathD" 
              :d="activePathD" 
              fill="none" 
              class="stroke-blue-400/30" 
              stroke-width="16" 
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path 
              v-if="guidePathD" 
              :d="guidePathD" 
              fill="none" 
              stroke="#cbd5e1" 
              stroke-width="3" 
              stroke-dasharray="8 8" 
              stroke-linecap="round"
            />
            <path 
              ref="activeLineRef" 
              v-if="activePathD" 
              :d="activePathD" 
              fill="none" 
              class="stroke-blue-600" 
              stroke-width="5" 
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Grid dos Setores (Assimetria e Glassmorphism) -->
          <div class="flex flex-wrap gap-x-12 gap-y-24 justify-center items-center relative pl-8 pr-8">
            <div 
              v-for="(item, idx) in rota" 
              :key="item.id"
              :ref="el => setCardRef(el, idx)"
              :class="[
                'tv-card relative flex flex-col justify-between p-8 w-80 min-h-[220px] transition-all duration-700 ease-out',
                /* Assimetria: desloca itens pares ligeiramente para baixo para quebrar a grade reta */
                idx % 2 === 0 ? 'translate-y-8' : '-translate-y-4',
                isSectorActive(item.setorId) 
                  ? 'bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_20px_40px_-15px_rgba(37,99,235,0.2)] scale-105 rounded-[2rem]' 
                  : 'bg-white/40 backdrop-blur-md border border-white/30 shadow-[0_8px_30px_rgb(0,0,0,0.04)] opacity-80 hover:opacity-100 rounded-[1.5rem]'
              ]"
            >
              <!-- Indicadores Flutuantes Orgânicos -->
              <div class="absolute -top-4 -left-4 flex flex-col gap-2 z-10">
                <span v-if="isSectorActiveForLot(item.setorId, 'CAIXA_TESTE')" class="px-4 py-1.5 text-xs font-extrabold tracking-widest bg-blue-600 text-white uppercase rounded-full shadow-md transform hover:scale-105 transition-transform">
                  Caixa Teste
                </span>
                <span v-if="isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="px-4 py-1.5 text-xs font-extrabold tracking-widest bg-slate-900 text-white uppercase rounded-full shadow-md transform hover:scale-105 transition-transform">
                  Lote Principal
                </span>
              </div>

              <!-- Informações do Setor -->
              <div>
                <div class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Passo {{ idx + 1 }}
                </div>
                <h3 class="font-extrabold text-slate-900 text-3xl leading-none tracking-tight">
                  {{ item.setor?.nome }}
                </h3>
              </div>

              <!-- Tempos e Horários -->
              <div class="mt-8 pt-5 border-t border-slate-200/50 flex flex-col gap-4">
                <div v-if="getLiveTime(item.setorId, 'CAIXA_TESTE')" class="flex justify-between items-center text-sm font-medium">
                  <span class="text-blue-600 font-bold uppercase tracking-wider">Live CX</span>
                  <span class="text-blue-800 font-bold bg-blue-100/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    {{ getLiveTime(item.setorId, 'CAIXA_TESTE') }}
                  </span>
                </div>
                
                <div v-if="getLiveTime(item.setorId, 'LOTE_PRINCIPAL')" class="flex justify-between items-center text-sm font-medium">
                  <span class="text-slate-700 font-bold uppercase tracking-wider">Live LP</span>
                  <span class="text-slate-900 font-bold bg-slate-200/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    {{ getLiveTime(item.setorId, 'LOTE_PRINCIPAL') }}
                  </span>
                </div>

                <div class="text-xs font-medium text-slate-500 space-y-1.5 mt-2">
                  <div v-if="getSectorEnteringDate(item.setorId, 'CAIXA_TESTE')" class="flex justify-between">
                    <span>Entrada (CX)</span>
                    <span class="text-slate-800 font-bold">{{ getSectorEnteringDate(item.setorId, 'CAIXA_TESTE') }}</span>
                  </div>
                  <div v-if="getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL')" class="flex justify-between">
                    <span>Entrada (LP)</span>
                    <span class="text-slate-800 font-bold">{{ getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rodapé TV -->
      <div class="tv-header relative z-10 flex justify-between items-center mt-12 pt-8 border-t border-slate-200/50 text-slate-500 font-medium text-sm tracking-widest">
        <div class="flex items-center gap-4">
          <span :class="['w-3 h-3 rounded-full', liveStatus === 'CONNECTED' ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.8)] animate-pulse' : 'bg-slate-300']"></span>
          <span>{{ liveStatus === 'CONNECTED' ? 'SYNC: LIVE' : 'SYNC: OFFLINE' }}</span>
        </div>
        <div>
          <span class="text-slate-700 font-bold">{{ now.toLocaleDateString() }}</span> &mdash; <span>{{ now.toLocaleTimeString() }}</span>
        </div>
      </div>
    </div>

    <!-- MODO PADRÃO (Dashboard) -->
    <div v-else class="p-8 max-w-7xl mx-auto">
      <header class="border-b border-slate-200 pb-8 mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div class="flex flex-col gap-4">
          <button @click="router.back()" class="self-start text-slate-500 hover:text-slate-900 transition-transform active:scale-95 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" type="button">
            <ArrowLeft :size="16" /> Voltar
          </button>
          <div>
            <h1 class="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tighter uppercase leading-none">Rastreamento</h1>
            <p class="text-sm text-slate-500 mt-2 uppercase tracking-widest font-medium">Monitoramento Chão de Fábrica</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <button 
            @click="isTvMode = true" 
            class="text-xs flex items-center gap-2 px-5 py-3 bg-blue-600 text-white font-bold uppercase tracking-widest rounded-full hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            type="button"
          >
            <Maximize :size="16" /> Modo TV
          </button>

          <div class="border border-slate-200 rounded-full flex items-center gap-3 px-5 py-3 bg-white shadow-xs text-slate-700">
            <span :class="['w-2.5 h-2.5 rounded-full', liveStatus === 'CONNECTED' ? 'bg-blue-600 animate-pulse' : 'bg-slate-300']"></span>
            <span class="text-xs font-bold tracking-widest">{{ liveStatus === 'CONNECTED' ? 'ONLINE' : 'OFFLINE' }}</span>
          </div>

          <button @click="fetchOrdemDetails" class="text-xs flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-full hover:bg-slate-50 text-slate-700 font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xs cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:ring-offset-2" type="button">
            <RotateCcw :size="14" /> Sinc.
          </button>
        </div>
      </header>

      <!-- Seleção de Ordem -->
      <div class="mb-10 p-6 bg-white border border-slate-200 rounded-3xl shadow-xs flex flex-col sm:flex-row sm:items-center gap-6">
        <label for="ordem-select-normal" class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 min-w-max">
          <Tag :size="16" /> Ordem Ativa:
        </label>
        <select id="ordem-select-normal" v-model="ordemId" class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-600 transition-shadow appearance-none cursor-pointer">
          <option v-for="o in ordens" :key="o.id" :value="o.id">
            {{ o.codigoBarras }} — {{ o.modelo?.nome || 'Sem Modelo' }} [{{ o.status }}]
          </option>
        </select>
      </div>

      <!-- Resumo Ordem -->
      <div v-if="loading" class="p-16 bg-white border border-slate-200 rounded-3xl flex justify-center items-center shadow-xs">
        <span class="text-slate-400 text-sm font-medium uppercase tracking-widest">Carregando...</span>
      </div>
      <div v-else-if="!ordem" class="p-16 bg-white border border-slate-200 rounded-3xl text-center shadow-xs">
        <span class="text-slate-400 text-sm font-medium uppercase tracking-widest">Nenhuma Ordem Selecionada</span>
      </div>
      <div v-else class="space-y-10">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs hover:shadow-md transition-shadow">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Modelo</span>
            <span class="font-extrabold text-slate-900 block text-2xl tracking-tight leading-none">{{ ordem.modelo?.nome || 'N/A' }}</span>
            <span class="text-xs text-slate-500 font-medium block mt-2">{{ ordem.modelo?.referencia || 'N/A' }}</span>
          </div>
          <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs hover:shadow-md transition-shadow">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Código Barras</span>
            <span class="font-extrabold text-slate-900 block text-2xl tracking-tight leading-none">{{ ordem.codigoBarras }}</span>
          </div>
          <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs hover:shadow-md transition-shadow">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Status</span>
            <span class="inline-block px-4 py-1.5 text-xs font-bold tracking-widest rounded-full bg-slate-900 text-white uppercase mt-1">
              {{ ordem.status }}
            </span>
          </div>
          <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs hover:shadow-md transition-shadow">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Data Início</span>
            <span class="text-sm font-bold text-slate-800 block mt-1">
              {{ new Date(ordem.dataInicio).toLocaleDateString() }}
            </span>
            <span class="text-xs text-slate-500 font-medium block mt-1">
              {{ new Date(ordem.dataInicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </div>
        </div>

        <!-- Rota de Produção Desktop -->
        <div class="bg-white border border-slate-200 rounded-3xl p-10 shadow-xs">
          <h2 class="text-sm font-extrabold text-slate-900 uppercase tracking-widest mb-12 flex items-center gap-3">
            <Layers :size="18" class="text-blue-600" /> Rota de Produção
          </h2>

          <div v-if="rota.length === 0" class="text-center py-16 text-slate-400 text-sm font-medium uppercase tracking-widest">
            Nenhuma rota cadastrada
          </div>

          <div v-else ref="containerRef" class="relative w-full">
            <svg class="absolute inset-0 pointer-events-none w-full h-full min-h-[300px]">
              <path 
                v-if="guidePathD" 
                :d="guidePathD" 
                fill="none" 
                stroke="#e2e8f0" 
                stroke-width="3" 
                stroke-dasharray="6 6" 
                stroke-linecap="round"
              />
              <path 
                ref="activeLineRef" 
                v-if="activePathD" 
                :d="activePathD" 
                fill="none" 
                class="stroke-blue-600" 
                stroke-width="4" 
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>

            <div class="flex flex-wrap gap-x-12 gap-y-16 justify-start items-center relative py-4">
              <div 
                v-for="(item, idx) in rota" 
                :key="item.id"
                :ref="el => setCardRef(el, idx)"
                :class="[
                  'relative flex flex-col justify-between p-7 w-64 min-h-[180px] bg-white transition-all duration-300 ease-out',
                  idx % 2 !== 0 ? 'translate-y-6' : '',
                  isSectorActive(item.setorId) 
                    ? 'border-2 border-blue-600 shadow-lg scale-[1.02] rounded-3xl z-10' 
                    : 'border border-slate-200 rounded-3xl opacity-90 hover:opacity-100 hover:shadow-md'
                ]"
              >
                <!-- Labels Lote / Caixa Teste Flutuantes -->
                <div class="absolute -top-3.5 left-6 flex flex-col gap-1.5 z-10">
                  <span v-if="isSectorActiveForLot(item.setorId, 'CAIXA_TESTE')" class="px-3 py-1 text-[10px] font-extrabold tracking-widest bg-blue-600 text-white uppercase rounded-full shadow-sm">
                    Caixa Teste
                  </span>
                  <span v-if="isSectorActiveForLot(item.setorId, 'LOTE_PRINCIPAL')" class="px-3 py-1 text-[10px] font-extrabold tracking-widest bg-slate-900 text-white uppercase rounded-full shadow-sm">
                    Lote Principal
                  </span>
                </div>

                <div>
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Passo {{ idx + 1 }}
                  </div>
                  <h3 class="font-extrabold text-slate-900 text-xl leading-tight tracking-tight">
                    {{ item.setor?.nome }}
                  </h3>
                  <p class="text-xs text-slate-500 mt-2 font-medium uppercase tracking-wide">
                    {{ item.setor?.tipoSetor || 'N/A' }}
                  </p>
                </div>

                <div class="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-3">
                  <div v-if="getLiveTime(item.setorId, 'CAIXA_TESTE')" class="flex justify-between items-center text-xs font-bold">
                    <span class="text-blue-600 uppercase tracking-wider">Live CX</span>
                    <span class="text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md">
                      {{ getLiveTime(item.setorId, 'CAIXA_TESTE') }}
                    </span>
                  </div>
                  
                  <div v-if="getLiveTime(item.setorId, 'LOTE_PRINCIPAL')" class="flex justify-between items-center text-xs font-bold">
                    <span class="text-slate-700 uppercase tracking-wider">Live LP</span>
                    <span class="text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                      {{ getLiveTime(item.setorId, 'LOTE_PRINCIPAL') }}
                    </span>
                  </div>

                  <div class="text-[11px] font-medium text-slate-500 space-y-1.5 mt-1">
                    <div v-if="getSectorEnteringDate(item.setorId, 'CAIXA_TESTE')" class="flex justify-between">
                      <span>IN (CX)</span>
                      <span class="text-slate-800 font-bold">{{ getSectorEnteringDate(item.setorId, 'CAIXA_TESTE') }}</span>
                    </div>
                    <div v-if="getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL')" class="flex justify-between">
                      <span>IN (LP)</span>
                      <span class="text-slate-800 font-bold">{{ getSectorEnteringDate(item.setorId, 'LOTE_PRINCIPAL') }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Glassmorphism overrides & custom easings injected via inline classes */
/* Animação suave para as mudanças de rotas */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease-out;
}
.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
