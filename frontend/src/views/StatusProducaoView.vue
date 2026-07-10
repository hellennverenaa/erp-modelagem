<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import api from '../api/axios'
import { RotateCcw, Activity } from '@lucide/vue'

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
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
let socket: any = null

const lotes = ref<any[]>([])
const modelos = ref<any[]>([])
const selectedLoteId = ref<string>('')
const selectedLoteHistory = ref<any[]>([])

async function fetchLotesAndModelos() {
  try {
    const [lotesRes, modelosRes] = await Promise.all([
      api.get('/lotes'),
      api.get('/admin/modelos/catalogo')
    ])
    modelos.value = modelosRes.data
    
    lotes.value = lotesRes.data.map((l: any) => {
      const mod = modelos.value.find(m => m.id === l.modeloId)
      return { ...l, modeloNome: mod ? mod.nome : 'N/A' }
    })

    if (lotes.value.length > 0 && !selectedLoteId.value) {
      selectedLoteId.value = lotes.value[0].id
    }
  } catch (error) {
    console.error('Error fetching lotes/modelos:', error)
  } finally {
    loading.value = false
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

function initWebSocket() {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api')
  socket = io(apiUrl.replace('/api', ''), { transports: ['websocket'], reconnection: true })

  socket.on('connect', () => { liveStatus.value = 'CONNECTED' })
  socket.on('disconnect', () => { liveStatus.value = 'DISCONNECTED' })
  socket.on('peca:avanco', () => {
    fetchLotesAndModelos()
    if (selectedLoteId.value) fetchSelectedLoteHistory()
  })
}

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
  if (nome.includes('SERIGRAFIA') || nome.includes('BORDADO')) return 'serigrafia_bordado'
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
  return getStepIdForSector(active ? active.setor : trackings[trackings.length - 1].setor)
})

const currentLotePrincipalStepId = computed(() => {
  if (!selectedLoteHistory.value || selectedLoteHistory.value.length === 0) return null
  const trackings = selectedLoteHistory.value.filter(r => r.tipoLote === 'LOTE_PRINCIPAL')
  if (trackings.length === 0) return null
  const active = trackings.find(r => !r.dataSaida)
  return getStepIdForSector(active ? active.setor : trackings[trackings.length - 1].setor)
})

function isStepActive(stepId: string) {
  return currentCaixaTesteStepId.value === stepId || currentLotePrincipalStepId.value === stepId
}

function isStepCompleted(stepId: string) {
  const stepIdx = steps.findIndex(s => s.id === stepId)
  const ctStepIdx = steps.findIndex(s => s.id === currentCaixaTesteStepId.value)
  const lpStepIdx = steps.findIndex(s => s.id === currentLotePrincipalStepId.value)
  return stepIdx < Math.max(ctStepIdx, lpStepIdx)
}

watch(selectedLoteId, fetchSelectedLoteHistory)

onMounted(() => {
  fetchLotesAndModelos().then(fetchSelectedLoteHistory)
  initWebSocket()
})

onUnmounted(() => { if (socket) socket.disconnect() })
</script>

<template>
  <div class="dashboard-gerencial">
    <header class="dashboard-header border-b border-slate-200 pb-6 mb-8">
      <div class="header-left">
        <h1 class="panel-title-giant text-slate-900">STATUS DA PRODUÇÃO</h1>
        <p class="panel-subtitle-dim text-slate-500">Acompanhamento de lotes e fluxo de setores em tempo real</p>
      </div>

      <div class="header-right">
        <div class="status-indicator border border-slate-200">
          <span :class="['status-dot', liveStatus === 'CONNECTED' ? 'status-dot--live' : 'status-dot--offline']"></span>
          <span class="status-text text-slate-600 font-mono">{{ liveStatus === 'CONNECTED' ? 'SINC. LIVE ATIVA' : 'SINC. OFFLINE' }}</span>
        </div>
        <button @click="fetchSelectedLoteHistory" class="btn-refresh text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm" type="button">
          <RotateCcw :size="14" class="text-slate-600" />
          <span>Sincronizar</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="skeleton-wrapper">
      <div class="skeleton-card skeleton-card--span-12"></div>
    </div>

    <div v-else class="bento-grid">
      <section class="bento-card bento-card--span-12 layout-glass hover-spring">
        <div class="card-heading-simple flex justify-between items-center w-full">
          <div class="flex items-start gap-2">
            <div class="heading-icon-wrap bg-slate-100 border border-slate-200">
              <Activity :size="16" class="text-slate-700" />
            </div>
            <div>
              <h2 class="card-title-brutalist text-slate-800">TIMELINE DUAL</h2>
              <p class="card-desc-brutalist text-slate-500">Rastreamento em tempo real de Caixa Teste e Lote Principal</p>
            </div>
          </div>

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

        <div class="stepper-scroll-container">
          <div v-if="!selectedLoteId" class="empty-state-brutalist border-slate-200 text-slate-400 py-6">
            Nenhuma ordem de teste ativa disponível para visualização.
          </div>
          <div v-else class="stepper-track">
            <div
              v-for="(step, idx) in steps"
              :key="step.id"
              class="step-node-wrapper"
              :class="{ 'step-completed': isStepCompleted(step.id), 'step-active': isStepActive(step.id) }"
            >
              <div v-if="idx > 0" class="step-connector"></div>
              <div class="step-node">
                <div class="floating-indicators-container">
                  <span v-if="currentCaixaTesteStepId === step.id" class="lote-badge bg-orange-500 text-white font-mono shadow-sm animate-bounce-slow" title="Caixa Teste">CT</span>
                  <span v-if="currentLotePrincipalStepId === step.id" class="lote-badge bg-blue-600 text-white font-mono shadow-sm animate-bounce-slow" title="Lote Principal">LP</span>
                </div>
                <div class="node-circle border-slate-200">
                  <span class="node-number font-mono">{{ idx + 1 }}</span>
                </div>
                <span class="node-label text-slate-700 font-semibold">{{ step.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-gerencial { min-height: 100%; background-color: transparent; padding: 1rem 0 2rem; color: #334155; font-family: 'Inter', -apple-system, sans-serif; text-align: left !important; }
.dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; }
.panel-title-giant { font-size: 2.25rem; font-weight: 800; letter-spacing: -0.04em; margin: 0; line-height: 1.1; }
.panel-subtitle-dim { font-size: 0.875rem; margin-top: 0.25rem; }
.header-right { display: flex; align-items: center; gap: 1rem; }
.status-indicator { display: flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.8); padding: 0.375rem 0.75rem; border-radius: 2rem; backdrop-filter: blur(8px); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; }
.status-dot--live { background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(0.9); opacity: 0.6; } 50% { transform: scale(1.1); opacity: 1; } }
.status-dot--offline { background-color: #94a3b8; }
.status-text { font-size: 10px; }
.btn-refresh { display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.875rem; font-size: 0.8125rem; font-weight: 600; background: #ffffff; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s ease; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; }
.bento-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 1.5rem; }
.bento-card { border-radius: 1.25rem; padding: 1.75rem; display: flex; flex-direction: column; position: relative; }
.bento-card--span-12 { grid-column: span 12; }
.layout-glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(226, 232, 240, 0.6); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02); }
.hover-spring { transition: all 0.5s cubic-bezier(0.32, 0.72, 0, 1); will-change: transform, box-shadow; }
.hover-spring:hover { transform: translateY(-5px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); }
.card-heading-simple { display: flex; align-items: flex-start; gap: 0.875rem; margin-bottom: 1.75rem; }
.heading-icon-wrap { width: 2rem; height: 2rem; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.card-title-brutalist { font-size: 0.875rem; font-weight: 800; letter-spacing: 0.05em; margin: 0; }
.card-desc-brutalist { font-size: 0.75rem; margin-top: 0.125rem; }
.select-container { flex-shrink: 0; }
.stepper-scroll-container { overflow-x: auto; padding: 2.25rem 0.5rem 0.75rem; -webkit-overflow-scrolling: touch; }
.stepper-track { display: flex; align-items: center; min-width: max-content; width: 100%; padding-bottom: 0.5rem; }
.step-node-wrapper { display: flex; align-items: center; position: relative; flex: 1; }
.step-connector { height: 3px; background: #e2e8f0; flex-grow: 1; min-width: 2.5rem; margin: 0 -0.5rem; transition: background 0.3s; }
.step-completed .step-connector { background: #3b82f6; }
.step-node { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; position: relative; min-width: 7rem; }
.node-circle { width: 2.25rem; height: 2.25rem; border-radius: 50%; border: 2px solid #e2e8f0; background: #ffffff; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; z-index: 10; }
.step-active .node-circle { border-color: #3b82f6; background: #eff6ff; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15); }
.step-completed .node-circle { border-color: #3b82f6; background: #3b82f6; }
.node-number { font-size: 0.75rem; font-weight: 750; color: #64748b; transition: color 0.3s; }
.step-completed .node-number { color: #ffffff; }
.step-active .node-number { color: #3b82f6; }
.node-label { font-size: 0.75rem; text-align: center; white-space: nowrap; transition: color 0.3s; }
.step-active .node-label { color: #0f172a; }
.step-completed .node-label { color: #334155; }
.floating-indicators-container { position: absolute; top: -1.8rem; display: flex; gap: 0.25rem; justify-content: center; align-items: center; z-index: 20; }
.lote-badge { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 9px; font-weight: 800; padding: 0.125rem 0.375rem; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08); }
@keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.animate-bounce-slow { animation: bounce-slow 2s infinite ease-in-out; }
.empty-state-brutalist { padding: 2.5rem 1rem; text-align: center; font-family: ui-monospace, monospace; font-size: 11px; }
.skeleton-wrapper { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 1.5rem; }
.skeleton-card { height: 250px; background: #e2e8f0; border-radius: 1.25rem; animation: pulse-skele 1.8s infinite ease-in-out; }
.skeleton-card--span-12 { grid-column: span 12; height: 160px; }
@keyframes pulse-skele { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
</style>