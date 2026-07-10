<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { Clock, AlertTriangle, TrendingUp, RotateCcw, Eye } from '@lucide/vue'

const loading = ref(true)
const kpiA = ref({ mediaCaixaTeste: 0, mediaLotePrincipal: 0, grafico: [] })
const kpiB = ref([])
const kpiC = ref({ fpyGlobal: 100, setores: [] })
const kpiD = ref({ totalRetrabalhos: 0, setores: [] })

const liveStatus = ref('DISCONNECTED')
let socket = null
const modalFotoUrl = ref(null)

async function fetchKpis() {
  try {
    const res = await api.get('/dashboard/kpis')
    kpiA.value = res.data.kpiA
    kpiB.value = res.data.kpiB
    kpiC.value = res.data.kpiC
    kpiD.value = res.data.kpiD
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error)
  } finally {
    loading.value = false
  }
}

function initWebSocket() {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
  socket = io(apiUrl.replace('/api', ''), { transports: ['websocket'], reconnection: true })
  socket.on('connect', () => { liveStatus.value = 'CONNECTED' })
  socket.on('disconnect', () => { liveStatus.value = 'DISCONNECTED' })
  socket.on('gargalo:update', fetchKpis)
  socket.on('peca:avanco', fetchKpis)
}

onMounted(() => {
  fetchKpis()
  initWebSocket()
})

onUnmounted(() => { if (socket) socket.disconnect() })

function getFotoUrl(path) {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
  return `${apiUrl.replace('/api', '')}/${path}`
}

function formatHour(val) {
  const hours = Math.floor(val)
  const minutes = Math.round((val - hours) * 60)
  return `${hours}h ${minutes}min`
}
</script>

<template>
  <div class="bg-slate-50 min-h-screen p-6 md:p-8 font-sans text-slate-700 flex flex-col gap-8 animate-fade-in">
    <!-- Header Enterprise -->
    <header class="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-slate-200 pb-6 gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 uppercase">Torre de Controle</h1>
        <p class="text-xs md:text-sm text-slate-500 mt-1">Monitoramento em tempo real de KPIs de engenharia e modelagem</p>
      </div>

      <div class="flex items-center gap-3 self-end sm:self-center">
        <!-- Status de conexão em tempo real -->
        <div class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
          <span :class="['w-1.5 h-1.5 rounded-full', liveStatus === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300']"></span>
          <span class="text-[9px] font-mono text-slate-600 font-bold uppercase tracking-wider">{{ liveStatus === 'CONNECTED' ? 'SINC. LIVE ATIVA' : 'SINC. OFFLINE' }}</span>
        </div>

        <button @click="fetchKpis" class="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-lg shadow-sm cursor-pointer transition-all" type="button">
          <RotateCcw :size="14" class="text-slate-500" />
          <span>Sincronizar</span>
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-7 h-[300px] bg-slate-200 rounded-2xl animate-pulse"></div>
      <div class="lg:col-span-5 h-[300px] bg-slate-200 rounded-2xl animate-pulse"></div>
      <div class="lg:col-span-6 h-[250px] bg-slate-200 rounded-2xl animate-pulse"></div>
      <div class="lg:col-span-6 h-[250px] bg-slate-200 rounded-2xl animate-pulse"></div>
    </div>

    <!-- Bento Grid Content -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- PAINEL A: LEAD TIME DO TESTE -->
      <section class="lg:col-span-7 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
        <div>
          <div class="flex items-start gap-4 mb-6">
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <Clock :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-slate-900 uppercase tracking-widest font-mono">Lead Time Médio</h2>
              <p class="text-[10px] text-slate-400 font-medium leading-relaxed">Tempo médio decorrido descontando interrupções de SLA (últimas 5 ordens)</p>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-6 mt-4">
            <div class="flex-1 flex flex-col gap-1">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Caixa Teste</span>
              <span class="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter font-mono">{{ formatHour(kpiA.mediaCaixaTeste) }}</span>
            </div>
            <div class="flex-1 flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-slate-200 pt-4 sm:pt-0 sm:pl-8">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Lote Principal</span>
              <span class="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter font-mono">{{ formatHour(kpiA.mediaLotePrincipal) }}</span>
            </div>
          </div>
        </div>

        <div class="mt-8 border border-slate-200/60 bg-slate-50/50 p-4 rounded-xl">
          <div class="mb-3">
            <span class="text-slate-500 font-mono text-xs">Variação do Tempo de Ciclo (Últimas 10)</span>
          </div>
          <div class="mt-2">
            <svg viewBox="0 0 500 80" class="w-full h-20 overflow-visible">
              <line x1="0" y1="40" x2="500" y2="40" stroke="#e2e8f0" stroke-dasharray="4" />
              <path
                v-if="kpiA.grafico.length > 0"
                fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                :d="kpiA.grafico.map((item, i) => { const maxVal = Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1); const x = (i / Math.max(1, kpiA.grafico.length - 1)) * 500; const y = 80 - (item.leadTimeHoras / maxVal) * 60 - 10; return `${x},${y}` }).reduce((acc, curr, idx) => idx === 0 ? `M ${curr}` : `${acc} L ${curr}`, '')"
              />
              <circle
                v-for="(item, i) in kpiA.grafico" :key="i"
                :cx="(i / Math.max(1, kpiA.grafico.length - 1)) * 500"
                :cy="80 - (item.leadTimeHoras / Math.max(...kpiA.grafico.map(x => x.leadTimeHoras), 1)) * 60 - 10"
                r="3.5" fill="#ffffff" stroke="#3b82f6" stroke-width="2"
              />
            </svg>
          </div>
          <div class="mt-2 flex justify-between font-mono text-[10px] text-slate-400">
            <span>Recentes</span><span>Antigos</span>
          </div>
        </div>
      </section>

      <!-- PAINEL B: MAPA DE GARGALOS -->
      <section class="lg:col-span-5 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
        <div>
          <div class="flex items-start gap-4 mb-6">
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <AlertTriangle :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-slate-900 uppercase tracking-widest font-mono">Gargalos Operacionais</h2>
              <p class="text-[10px] text-slate-400 font-medium leading-relaxed">Incidentes em aberto interrompendo ou atrasando a produção</p>
            </div>
          </div>

          <div class="max-h-[380px] overflow-y-auto pr-1">
            <div v-if="kpiB.length === 0" class="text-center py-8 text-slate-400 text-xs font-mono border border-dashed border-slate-200 rounded-xl">
              Nenhum gargalo registrado ou em análise no momento.
            </div>
            <div v-else class="flex flex-col gap-4">
              <div v-for="oc in kpiB" :key="oc.id" class="border border-slate-200 bg-slate-50/40 p-4 rounded-xl flex gap-4 hover:border-slate-300 hover:bg-slate-50 transition-colors duration-300">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span :class="['font-mono text-[9px] font-black border px-2 py-0.5 rounded-sm tracking-wider shadow-xs', oc.gravidade === 'CRITICA' || oc.gravidade === 'ALTA' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200']">
                      {{ oc.gravidade }}
                    </span>
                    <span class="font-mono text-slate-500 text-xs">{{ oc.setor }}</span>
                  </div>
                  <h3 class="text-slate-800 font-bold text-sm mt-1">{{ oc.titulo }}</h3>
                  <p class="text-slate-500 text-xs mt-1 leading-relaxed">{{ oc.descricao }}</p>
                  <div class="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                    <span>Por: {{ oc.reportadoPor }}</span>
                  </div>
                </div>
                <div v-if="oc.fotos && oc.fotos.length > 0" class="flex-shrink-0 flex items-center">
                  <div @click="modalFotoUrl = getFotoUrl(oc.fotos[0])" class="w-14 h-14 rounded-xl border border-slate-200/60 overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-300 relative" role="button">
                    <img :src="getFotoUrl(oc.fotos[0])" alt="Foto da ocorrencia" class="w-full h-full object-cover" crossorigin="anonymous" />
                    <div class="absolute inset-0 bg-slate-950/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                      <Eye :size="14" class="text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL C: FPY -->
      <section class="lg:col-span-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
        <div>
          <div class="flex items-start gap-4 mb-6">
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <TrendingUp :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-slate-900 uppercase tracking-widest font-mono">First Pass Yield (FPY)</h2>
              <p class="text-[10px] text-slate-400 font-medium leading-relaxed">Percentual de aprovações sem retrabalho na primeira inspeção (últimos 30 dias)</p>
            </div>
          </div>

          <div class="mb-6">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">FPY Global</span>
            <div class="flex items-baseline gap-2 mt-1">
              <span class="text-5xl font-mono font-black text-slate-900 tracking-tighter">{{ kpiC.fpyGlobal }}%</span>
              <span :class="['inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[9px] font-black tracking-wider uppercase border', kpiC.fpyGlobal >= 90 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200']">
                {{ kpiC.fpyGlobal >= 90 ? 'DENTRO DA META' : 'ABAIXO DA META' }}
              </span>
            </div>
          </div>

          <div class="flex flex-col gap-4 border-t border-slate-100 pt-4">
            <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-1">Rendimento por Setor</h3>
            <div v-if="kpiC.setores.length === 0" class="text-center py-4 text-slate-400 text-xs font-mono border border-dashed border-slate-200 rounded-xl">
              Nenhuma inspeção de FPY registrada.
            </div>
            <div v-else class="flex flex-col gap-3">
              <div v-for="item in kpiC.setores" :key="item.setor" class="flex flex-col gap-1">
                <div class="flex justify-between items-center text-xs">
                  <span class="font-bold text-slate-800 uppercase tracking-wide">{{ item.setor }}</span>
                  <span class="font-mono font-extrabold text-slate-900">{{ item.fpyPercentual }}%</span>
                </div>
                <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500" :style="{ width: `${item.fpyPercentual}%` }" :class="[item.fpyPercentual >= 90 ? 'bg-emerald-500' : 'bg-red-500']"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAINEL D: ÍNDICE DE RETRABALHO -->
      <section class="lg:col-span-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
        <div>
          <div class="flex items-start gap-4 mb-6">
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <AlertTriangle :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-slate-900 uppercase tracking-widest font-mono">Índice de Retrabalho</h2>
              <p class="text-[10px] text-slate-400 font-medium leading-relaxed">Volume e incidência de peças reprovadas por setor de origem</p>
            </div>
          </div>

          <div class="mb-6">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total de Ocorrências</span>
            <div class="flex items-baseline gap-2 mt-1">
              <span class="text-5xl font-mono font-black text-slate-900 tracking-tighter">{{ kpiD.totalRetrabalhos }}</span>
              <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">peças reprovadas</span>
            </div>
          </div>

          <div class="flex flex-col gap-4 border-t border-slate-100 pt-4">
            <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-1">Setores com Maior Frequência</h3>
            <div v-if="kpiD.setores.length === 0" class="text-center py-4 text-slate-400 text-xs font-mono border border-dashed border-slate-200 rounded-xl">
              Nenhum retrabalho contabilizado.
            </div>
            <div v-else class="flex flex-col gap-3">
              <div v-for="item in kpiD.setores" :key="item.setorOrigem" class="flex flex-col gap-1">
                <div class="flex justify-between items-center text-xs">
                  <span class="font-bold text-slate-800 uppercase tracking-wide">{{ item.setorOrigem }}</span>
                  <div class="flex items-center gap-2 font-mono text-[10px]">
                    <span class="text-slate-400">{{ item.totalRetrabalhos }} ocorrências</span>
                    <span class="font-extrabold text-slate-900">({{ item.percentualDoTotal }}%)</span>
                  </div>
                </div>
                <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-orange-500 rounded-full transition-all duration-500" :style="{ width: `${item.percentualDoTotal}%` }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Modal para visualização ampliada de fotos -->
    <div v-if="modalFotoUrl" class="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6" @click="modalFotoUrl = null">
      <div class="bg-white border border-slate-200 p-2 rounded-2xl max-w-4xl max-h-[80vh] flex flex-col items-center shadow-xl" @click.stop>
        <img :src="modalFotoUrl" alt="Foto ampliada" class="max-w-full max-h-[70vh] object-contain rounded-xl" crossorigin="anonymous" />
        <button @click="modalFotoUrl = null" class="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer transition-all">Fechar</button>
      </div>
    </div>
  </div>
</template>