<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io, Socket } from 'socket.io-client'
import api from '../api/axios'
import { gsap } from 'gsap'
import {
  ArrowLeft,
  RotateCcw,
  Layers,
  Maximize,
  X,
  Wifi,
  WifiOff,
  Box,
  PackageCheck,
  Clock,
  Activity,
  CheckCircle2,
  Check,
  AlertTriangle,
  Eye,
  User,
  Cpu,
  Image as ImageIcon
} from 'lucide-vue-next'

interface RastreamentoItem {
  id: string
  setorId: string
  setor?: { id: string; nome: string; tipoSetor?: string }
  estacao?: { id: string; nome: string; codigo?: string }
  operadorEntrada?: { id: string; nome: string; email?: string }
  operadorSaida?: { id: string; nome: string; email?: string }
  tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL'
  status: string
  dataEntrada: string
  dataSaida?: string | null
  tempoPermanenciaMin?: number | null
  ocorrencias?: Array<{
    id: string
    titulo: string
    descricao?: string | null
    dataOcorrencia: string
    interrompeSla: boolean
    resolvido?: boolean
    anexos?: Array<{ id: string; url: string; nomeArquivo: string }>
  }>
}

interface NodeTrackItem {
  key: string
  setorId: string
  nome: string
  dataEntrada: string
  dataSaida?: string | null
  status: string
  ordem: number
  tempoPermanenciaMin?: number | null
  slaAlvoMin?: number | null
  operadorEntradaNome?: string | null
  operadorSaidaNome?: string | null
  estacaoNome?: string | null
  ocorrencias?: Array<{
    id: string
    titulo: string
    descricao?: string | null
    dataOcorrencia: string
    interrompeSla: boolean
    resolvido?: boolean
    anexos?: Array<{ id: string; url: string; nomeArquivo: string }>
  }>
}

interface OrdemOP {
  id: string
  codigoBarras: string
  status: string
  possuiCaixaTeste: boolean
  slasPorSetor?: Record<string, number> | null
  modelo?: {
    id: string
    nome: string
    referencia?: string
    rotas?: Array<{ setorId?: string; setor?: { id: string }; ordem: number }>
  }
  historico: RastreamentoItem[]
  nodesCx: NodeTrackItem[]
  nodesLp: NodeTrackItem[]
  svgPathCx: string
  svgPathLp: string
}

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const liveStatus = ref<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED')
const ordens = ref<OrdemOP[]>([])
const selectedOrdemId = ref<string>((route.params.ordemTesteId as string) || '')
const isTvMode = ref(false)
const now = ref(new Date())

const selectedAuditNode = ref<{
  node: NodeTrackItem
  opCodigo: string
  modeloNome: string
} | null>(null)

let socket: Socket | null = null
let timerInterval: any = null

const nodeRefs = ref<Record<string, HTMLElement>>({})
const svgLineRefs = ref<Record<string, SVGPathElement>>({})

function setNodeRef(el: any, key: string) {
  if (el) {
    nodeRefs.value[key] = el as HTMLElement
  }
}

function setSvgLineRef(el: any, key: string) {
  if (el) {
    svgLineRefs.value[key] = el as SVGPathElement
  }
}

function openAuditDrawer(node: NodeTrackItem, opCodigo: string, modeloNome: string) {
  selectedAuditNode.value = { node, opCodigo, modeloNome }
}

function closeAuditDrawer() {
  selectedAuditNode.value = null
}

// --------------------------------------------------
// Algoritmo de Ordenação Estrita pela Rota do Modelo
// --------------------------------------------------
function sortNodesByRoute(nodes: NodeTrackItem[], rotasModelo: Array<{ setorId?: string; ordem: number }>): NodeTrackItem[] {
  const rotasOrderMap: Record<string, number> = {}
  if (Array.isArray(rotasModelo)) {
    rotasModelo.forEach(r => {
      const sId = r.setorId || (r as any).setor?.id
      if (sId) {
        rotasOrderMap[sId] = r.ordem || 1
      }
    })
  }

  return [...nodes].sort((a, b) => {
    const orderA = a.setorId === 'init' ? 0 : (rotasOrderMap[a.setorId] ?? 999)
    const orderB = b.setorId === 'init' ? 0 : (rotasOrderMap[b.setorId] ?? 999)

    if (orderA !== orderB) {
      return orderA - orderB
    }

    const dateA = new Date(a.dataEntrada).getTime()
    const dateB = new Date(b.dataEntrada).getTime()
    return dateA - dateB
  })
}

// --------------------------------------------------
// Formatação de Horários e SLAs
// --------------------------------------------------
function formatDataEntradaCompleta(isoDate: string): string {
  if (!isoDate) return 'Entrada: --/-- às --:--'
  try {
    const d = new Date(isoDate)
    const dia = d.getDate().toString().padStart(2, '0')
    const mes = (d.getMonth() + 1).toString().padStart(2, '0')
    const hora = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    return `Entrada: ${dia}/${mes} às ${hora}:${min}`
  } catch {
    return 'Entrada: --/-- às --:--'
  }
}

function formatPermanencia(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return 'Duração N/A'
  if (minutos < 60) return `Duração: ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `Duração: ${h}h ${m}min`
}

function getElapsedTimeInfo(node: NodeTrackItem) {
  if (!node.dataEntrada) return { text: '0m 0s', isOverdue: false, totalMins: 0 }

  const entryDate = new Date(node.dataEntrada).getTime()
  const diffMs = now.value.getTime() - entryDate
  if (diffMs <= 0) return { text: '0m 0s', isOverdue: false, totalMins: 0 }

  const totalSecs = Math.floor(diffMs / 1000)
  const totalMins = Math.floor(totalSecs / 60)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const secs = totalSecs % 60

  let text = ''
  if (hours > 0) {
    text = `${hours}h ${mins}min ${secs}s`
  } else {
    text = `${mins}min ${secs}s`
  }

  const isOverdue = Boolean(node.slaAlvoMin && totalMins > node.slaAlvoMin)
  return { text, isOverdue, totalMins }
}

// --------------------------------------------------
// Fetch Único Unificado (Payload Síncrono)
// --------------------------------------------------
async function fetchOrdensEPosicoes() {
  try {
    const res = await api.get('/lotes')
    const lotesBrutos: any[] = res.data || []

    const statusFinais = ['APROVADO', 'REPROVADO', 'LIBERADO_PRODUCAO', 'CANCELADO']
    const ordensAtivas = lotesBrutos.filter(o => !statusFinais.includes(o.status))

    const ordensProcessadas: OrdemOP[] = ordensAtivas.map((ordem) => {
      const hist: RastreamentoItem[] = ordem.rastreamentos || []
      const slasMap: Record<string, number> = ordem.slasPorSetor || {}
      const rotasModelo = (ordem.modelo as any)?.rotas || (ordem.modelo as any)?.rota_modelo || []

      const temCaixaTeste =
        (ordem.modelo as any)?.possuiCaixaTeste ||
        hist.some(h => h.tipoLote === 'CAIXA_TESTE') ||
        ordem.possuiCaixaTeste

      const histCx = hist.filter(h => h.tipoLote === 'CAIXA_TESTE')
      const histLp = hist.filter(h => h.tipoLote === 'LOTE_PRINCIPAL')

      const rawNodesCx: NodeTrackItem[] = histCx.map((h) => ({
        key: `cx-${ordem.id}-${h.setorId}-${h.id}`,
        setorId: h.setorId,
        nome: h.setor?.nome || 'Setor',
        dataEntrada: h.dataEntrada,
        dataSaida: h.dataSaida,
        status: h.status,
        ordem: 1,
        tempoPermanenciaMin: h.tempoPermanenciaMin ?? null,
        slaAlvoMin: slasMap[h.setorId] ? Number(slasMap[h.setorId]) : null,
        operadorEntradaNome: h.operadorEntrada?.nome || null,
        operadorSaidaNome: h.operadorSaida?.nome || null,
        estacaoNome: h.estacao?.nome || (h.estacao as any)?.codigo || null,
        ocorrencias: h.ocorrencias || []
      }))

      const rawNodesLp: NodeTrackItem[] = histLp.map((h) => ({
        key: `lp-${ordem.id}-${h.setorId}-${h.id}`,
        setorId: h.setorId,
        nome: h.setor?.nome || 'Setor',
        dataEntrada: h.dataEntrada,
        dataSaida: h.dataSaida,
        status: h.status,
        ordem: 1,
        tempoPermanenciaMin: h.tempoPermanenciaMin ?? null,
        slaAlvoMin: slasMap[h.setorId] ? Number(slasMap[h.setorId]) : null,
        operadorEntradaNome: h.operadorEntrada?.nome || null,
        operadorSaidaNome: h.operadorSaida?.nome || null,
        estacaoNome: h.estacao?.nome || (h.estacao as any)?.codigo || null,
        ocorrencias: h.ocorrencias || []
      }))

      if (rawNodesCx.length === 0 && temCaixaTeste) {
        rawNodesCx.push({
          key: `cx-${ordem.id}-init`,
          setorId: 'init',
          nome: 'Conferência Inicial',
          dataEntrada: new Date().toISOString(),
          status: 'EM_PROCESSO',
          ordem: 1,
          tempoPermanenciaMin: null,
          slaAlvoMin: slasMap['init'] ? Number(slasMap['init']) : null,
          operadorEntradaNome: 'Operador PCP / Entrada',
          operadorSaidaNome: null,
          estacaoNome: 'Bancada Inicial',
          ocorrencias: []
        })
      }

      if (rawNodesLp.length === 0) {
        rawNodesLp.push({
          key: `lp-${ordem.id}-init`,
          setorId: 'init',
          nome: 'Conferência Inicial',
          dataEntrada: new Date().toISOString(),
          status: 'EM_PROCESSO',
          ordem: 1,
          tempoPermanenciaMin: null,
          slaAlvoMin: slasMap['init'] ? Number(slasMap['init']) : null,
          operadorEntradaNome: 'Operador PCP / Entrada',
          operadorSaidaNome: null,
          estacaoNome: 'Bancada Inicial',
          ocorrencias: []
        })
      }

      const nodesCx = sortNodesByRoute(rawNodesCx, rotasModelo).map((n, i) => ({
        ...n,
        ordem: i + 1
      }))

      const nodesLp = sortNodesByRoute(rawNodesLp, rotasModelo).map((n, i) => ({
        ...n,
        ordem: i + 1
      }))

      return {
        id: ordem.id,
        codigoBarras: ordem.codigoBarras,
        status: ordem.status,
        possuiCaixaTeste: Boolean(temCaixaTeste),
        slasPorSetor: ordem.slasPorSetor,
        modelo: ordem.modelo,
        historico: hist,
        nodesCx,
        nodesLp,
        svgPathCx: '',
        svgPathLp: ''
      }
    })

    ordens.value = ordensProcessadas

    if (!selectedOrdemId.value && ordens.value.length > 0) {
      selectedOrdemId.value = ordens.value[0].id
    }
  } catch (err) {
    console.error('[RastreamentoOrdemView] Erro ao carregar ordens:', err)
  } finally {
    loading.value = false
    updateConnectorLines()
  }
}

// --------------------------------------------------
// Motor de Curvas Bézier SVG (nextTick + requestAnimationFrame)
// --------------------------------------------------
const updateConnectorLines = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      for (const o of ordens.value) {
        o.svgPathCx = calculateTrackPath(o.nodesCx)
        o.svgPathLp = calculateTrackPath(o.nodesLp)
      }

      nextTick(() => {
        animateSvgPathsAndCards()
      })
    })
  })
}

function calculateTrackPath(nodes: NodeTrackItem[]): string {
  if (nodes.length < 2) return ''
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  for (let i = 0; i < nodes.length - 1; i++) {
    const nodeA = nodes[i]
    const nodeB = nodes[i + 1]
    const elA = nodeRefs.value[nodeA.key]
    const elB = nodeRefs.value[nodeB.key]

    if (elA && elB && elA.offsetParent) {
      const containerRect = (elA.offsetParent as HTMLElement).getBoundingClientRect()
      const rectA = elA.getBoundingClientRect()
      const rectB = elB.getBoundingClientRect()

      const x1 = rectA.right - containerRect.left
      const y1 = rectA.top - containerRect.top + rectA.height / 2

      const x2 = rectB.left - containerRect.left
      const y2 = rectB.top - containerRect.top + rectB.height / 2

      segments.push({ x1, y1, x2, y2 })
    }
  }

  if (segments.length === 0) return ''

  let path = `M ${segments[0].x1} ${segments[0].y1}`
  for (const seg of segments) {
    const dx = Math.abs(seg.x2 - seg.x1)
    const cx1 = seg.x1 + Math.max(dx * 0.4, 20)
    const cy1 = seg.y1
    const cx2 = seg.x2 - Math.max(dx * 0.4, 20)
    const cy2 = seg.y2

    path += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${seg.x2} ${seg.y2}`
  }
  return path
}

function animateSvgPathsAndCards() {
  Object.values(svgLineRefs.value).forEach(lineEl => {
    if (!lineEl) return
    try {
      const length = lineEl.getTotalLength()
      if (length <= 0) return
      gsap.killTweensOf(lineEl)
      gsap.set(lineEl, { strokeDasharray: length, strokeDashoffset: length })
      gsap.to(lineEl, {
        strokeDashoffset: 0,
        duration: 1.4,
        ease: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      })
    } catch {
      // Fallback
    }
  })

  gsap.fromTo(
    '.dynamic-node-card',
    { scale: 0.85, opacity: 0 },
    {
      scale: 1,
      opacity: 1,
      duration: 0.6,
      stagger: 0.06,
      ease: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }
  )
}

// --------------------------------------------------
// WebSockets & Listeners
// --------------------------------------------------
function initWebSocket() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const socketUrl = apiUrl.replace(/\/api\/?$/, '')
  const token = localStorage.getItem('erp_token') || localStorage.getItem('token') || ''

  socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    withCredentials: true,
    auth: { token }
  })

  socket.on('connect', () => {
    liveStatus.value = 'CONNECTED'
  })

  socket.on('connect_error', (err: any) => {
    if (
      err?.message === 'TOKEN_EXPIRED' ||
      err?.message?.includes('Authentication error') ||
      err?.message?.includes('token')
    ) {
      console.warn('[WebSocket] Conexão rejeitada por autenticação. Interrompendo reconexões automáticas.')
      liveStatus.value = 'DISCONNECTED'
      socket?.disconnect()
    }
  })

  socket.on('disconnect', () => {
    liveStatus.value = 'DISCONNECTED'
  })

  socket.on('peca:avanco', () => {
    fetchOrdensEPosicoes()
  })

  socket.on('rastreamento:atualizado', () => {
    fetchOrdensEPosicoes()
  })
}

function handleResize() {
  updateConnectorLines()
}

watch(selectedOrdemId, (newId) => {
  if (newId && newId !== route.params.ordemTesteId) {
    router.push({ name: 'rastreamento-ordem', params: { ordemTesteId: newId } })
  }
})

onMounted(() => {
  fetchOrdensEPosicoes()
  initWebSocket()
  timerInterval = setInterval(() => {
    now.value = new Date()
  }, 1000)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  if (timerInterval) {
    clearInterval(timerInterval)
  }
  window.removeEventListener('resize', handleResize)
  gsap.killTweensOf('*')
})
</script>

<template>
  <div class="w-full min-h-screen bg-zinc-50 text-zinc-900 font-sf-rounded tracking-tight selection:bg-zinc-200 selection:text-zinc-900">
    <!-- DRAWER DE AUDITORIA E DIVERGÊNCIAS (SLIDE-OVER) -->
    <div
      v-if="selectedAuditNode"
      class="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-sm flex justify-end transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md bg-white/95 backdrop-blur-xl h-full shadow-2xl p-6 md:p-8 flex flex-col justify-between overflow-y-auto border-l border-zinc-200">
        <div>
          <!-- Drawer Header -->
          <div class="flex items-center justify-between pb-4 border-b border-zinc-200 mb-6">
            <div>
              <span class="text-xs font-mono font-bold text-emerald-700 uppercase block">
                AUDITORIA DE ETAPA ISO 9001
              </span>
              <h3 class="text-xl font-extrabold tracking-tighter text-zinc-900 uppercase">
                {{ selectedAuditNode.node.nome }}
              </h3>
              <span class="text-xs font-mono text-zinc-500">
                OP: {{ selectedAuditNode.opCodigo }} — {{ selectedAuditNode.modeloNome }}
              </span>
            </div>
            <button
              @click="closeAuditDrawer"
              class="p-2 hover:bg-zinc-100 rounded-xl text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors"
              type="button"
            >
              <X :size="20" />
            </button>
          </div>

          <!-- Seção de Responsáveis e Estação -->
          <div class="space-y-4 mb-6">
            <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">Rastreabilidade Operacional</h4>

            <div class="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-zinc-500 font-medium flex items-center gap-1.5">
                  <User :size="14" class="text-zinc-600" /> Operador Entrada:
                </span>
                <span class="font-bold text-zinc-900 font-mono">
                  {{ selectedAuditNode.node.operadorEntradaNome || 'Operador SSO Padrão' }}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-zinc-500 font-medium flex items-center gap-1.5">
                  <User :size="14" class="text-zinc-600" /> Operador Saída:
                </span>
                <span class="font-bold text-zinc-900 font-mono">
                  {{ selectedAuditNode.node.operadorSaidaNome || 'Em Andamento / Pendente' }}
                </span>
              </div>

              <div class="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                <span class="text-zinc-500 font-medium flex items-center gap-1.5">
                  <Cpu :size="14" class="text-zinc-600" /> Estação de Trabalho:
                </span>
                <span class="font-bold text-zinc-900 font-mono">
                  {{ selectedAuditNode.node.estacaoNome || 'Bancada Padrão' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Métricas de Permanência vs. SLA -->
          <div class="space-y-4 mb-6">
            <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">Métricas de Compliance SLA</h4>

            <div class="grid grid-cols-2 gap-3">
              <div class="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-center">
                <span class="text-[10px] font-mono text-zinc-500 block uppercase">Meta SLA</span>
                <span class="text-sm font-extrabold text-zinc-900 font-mono">
                  {{ selectedAuditNode.node.slaAlvoMin ? `${selectedAuditNode.node.slaAlvoMin} min` : 'Sem Meta' }}
                </span>
              </div>

              <div class="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-center">
                <span class="text-[10px] font-mono text-zinc-500 block uppercase">Tempo Real</span>
                <span class="text-sm font-extrabold text-zinc-900 font-mono">
                  {{ formatPermanencia(selectedAuditNode.node.tempoPermanenciaMin) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Feed de Ocorrências e Divergências -->
          <div class="space-y-4">
            <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">Feed de Ocorrências e Divergências</h4>

            <div v-if="selectedAuditNode.node.ocorrencias && selectedAuditNode.node.ocorrencias.length > 0" class="space-y-3">
              <div
                v-for="oc in selectedAuditNode.node.ocorrencias"
                :key="oc.id"
                class="p-4 bg-amber-50/60 border border-amber-300/60 rounded-xl space-y-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-amber-900">{{ oc.titulo }}</span>
                  <span v-if="oc.interrompeSla" class="px-2 py-0.5 text-[9px] font-mono font-bold bg-red-100 text-red-700 rounded-full">
                    Pausa SLA
                  </span>
                </div>
                <p v-if="oc.descricao" class="text-xs text-amber-800 leading-relaxed font-sans">
                  {{ oc.descricao }}
                </p>

                <!-- Galeria de Evidências Anexadas -->
                <div v-if="oc.anexos && oc.anexos.length > 0" class="pt-2 border-t border-amber-200/60">
                  <span class="text-[10px] font-mono text-amber-700 font-bold block mb-1.5 flex items-center gap-1">
                    <ImageIcon :size="12" /> Evidências Técnicas:
                  </span>
                  <div class="flex flex-wrap gap-2">
                    <img
                      v-for="anx in oc.anexos"
                      :key="anx.id"
                      :src="anx.url"
                      :alt="anx.nomeArquivo"
                      class="w-14 h-14 object-cover rounded-lg border border-amber-300 shadow-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="p-6 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-center">
              <span class="text-xs text-zinc-500 font-mono">
                Nenhuma ocorrência ou divergência registrada nesta etapa.
              </span>
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-zinc-200 mt-6">
          <button
            @click="closeAuditDrawer"
            class="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            type="button"
          >
            Fechar Painel de Auditoria
          </button>
        </div>
      </div>
    </div>

    <!-- MODO TV OVERLAY FULLSCREEN (LIGHT MODE) -->
    <div
      v-if="isTvMode"
      class="fixed inset-0 z-40 bg-zinc-50/95 backdrop-blur-2xl flex flex-col w-full min-h-screen overflow-hidden p-6 md:p-10 justify-between border-4 border-zinc-200"
      role="dialog"
      aria-modal="true"
    >
      <!-- Cabeçalho TV -->
      <div class="flex justify-between items-center pb-6 border-b border-zinc-200">
        <div class="text-left">
          <span class="text-xs font-mono font-black text-emerald-700 tracking-widest uppercase block mb-1">
            TORRE TV — CHÃO DE FÁBRICA ISO
          </span>
          <h1 class="text-2xl md:text-3xl font-extrabold tracking-tighter text-zinc-900 uppercase text-left">
            MONITORAMENTO MULTIÓRDENS EM TEMPO REAL
          </h1>
        </div>

        <div class="flex items-center gap-4">
          <div
            :class="[
              'px-4 py-1.5 rounded-full border text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 shadow-xs',
              liveStatus === 'CONNECTED'
                ? 'bg-emerald-100/80 border-emerald-300 text-emerald-800'
                : 'bg-zinc-100 border-zinc-300 text-zinc-600'
            ]"
          >
            <Wifi v-if="liveStatus === 'CONNECTED'" :size="14" class="animate-pulse text-emerald-600" />
            <WifiOff v-else :size="14" />
            <span>{{ liveStatus === 'CONNECTED' ? 'SYNC: LIVE' : 'SYNC: OFF' }}</span>
          </div>

          <button
            @click="isTvMode = false"
            class="p-2.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 rounded-xl cursor-pointer transition-all shadow-xs"
            type="button"
            aria-label="Sair do Modo TV"
          >
            <X :size="20" />
          </button>
        </div>
      </div>

      <!-- Conteúdo Central TV Multiórdens -->
      <main class="flex-1 my-6 overflow-y-auto space-y-8 pr-2">
        <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-4">
          <div class="w-10 h-10 border-4 border-zinc-200 border-t-emerald-600 rounded-full animate-spin"></div>
          <p class="text-zinc-500 font-mono text-xs uppercase tracking-widest">
            Sincronizando fluxo com servidor...
          </p>
        </div>

        <!-- Estado Vazio -->
        <div
          v-else-if="ordens.length === 0"
          class="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-300 bg-white/60 backdrop-blur-md rounded-3xl p-8 max-w-xl mx-auto shadow-sm"
        >
          <Layers :size="36" class="text-zinc-400 mb-3" />
          <h3 class="text-base font-bold text-zinc-800 uppercase tracking-tight">Nenhum Teste Ativo no Momento</h3>
          <p class="text-xs text-zinc-500 mt-2 font-mono leading-relaxed">
            Nenhum teste ativo no momento. Inicie uma nova Ordem de Teste para visualizar o fluxo em tempo real.
          </p>
        </div>

        <!-- Swimlanes por OP (Glassmorphism Claro) -->
        <div
          v-else
          v-for="ordem in ordens"
          :key="ordem.id"
          class="op-swimlane bg-white/70 backdrop-blur-md border border-zinc-200/60 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative"
        >
          <!-- Header OP -->
          <div class="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-zinc-200/80">
            <div class="text-left">
              <span class="text-xs font-mono font-bold text-emerald-700 uppercase tracking-wider block">
                {{ ordem.codigoBarras }}
              </span>
              <h2 class="text-2xl md:text-3xl font-extrabold tracking-tighter text-zinc-900 uppercase text-left">
                {{ ordem.modelo?.nome || 'Modelo sem Nome' }}
              </h2>
            </div>

            <div class="flex items-center gap-2">
              <span v-if="ordem.possuiCaixaTeste" class="px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300/60 text-amber-800 text-[10px] font-mono font-bold uppercase shadow-xs">
                Dual Track (Caixa Teste + Lote)
              </span>
              <span class="px-3 py-1 rounded-full bg-zinc-100 border border-zinc-300 text-[10px] font-mono font-bold text-zinc-700 uppercase shadow-xs">
                {{ ordem.status }}
              </span>
            </div>
          </div>

          <!-- Trilhas Horizontais Paralelas -->
          <div class="space-y-6 relative">
            <!-- Trilha 1: Caixa Teste (Fast Track) -->
            <div v-if="ordem.possuiCaixaTeste" class="bg-amber-50/40 border border-amber-300/40 rounded-2xl p-5 relative">
              <div class="flex items-center gap-2 text-amber-800 text-xs font-mono font-bold uppercase tracking-wider mb-4">
                <Box :size="14" />
                <span>Trilha 1 — Caixa Teste (Fast Track)</span>
              </div>

              <!-- Curva SVG da Trilha CX -->
              <svg class="absolute inset-0 pointer-events-none w-full h-full">
                <path
                  v-if="ordem.svgPathCx"
                  :ref="el => setSvgLineRef(el, `cx-${ordem.id}`)"
                  :d="ordem.svgPathCx"
                  fill="none"
                  stroke="#fbbf24"
                  stroke-width="2"
                  stroke-dasharray="4 4"
                />
              </svg>

              <div class="flex flex-wrap gap-4 items-center relative z-10">
                <div
                  v-for="node in ordem.nodesCx"
                  :key="node.key"
                  :ref="el => setNodeRef(el, node.key)"
                  :class="[
                    'dynamic-node-card min-w-[170px] rounded-xl p-4 transition-all duration-300 relative group',
                    node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                      ? 'bg-zinc-100/50 border border-zinc-200 text-zinc-500 opacity-80 shadow-xs'
                      : 'bg-white border border-zinc-300 text-zinc-900 shadow-md ring-2 ring-amber-400/20'
                  ]"
                >
                  <!-- Olhinho Expansível de Auditoria -->
                  <button
                    @click="openAuditDrawer(node, ordem.codigoBarras, ordem.modelo?.nome || 'Modelo')"
                    class="absolute top-2.5 right-2.5 p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                    title="Ver Detalhes de Auditoria"
                    type="button"
                  >
                    <Eye :size="14" />
                  </button>

                  <!-- Header do Nó com Status Visual -->
                  <div class="flex items-center justify-between gap-2 mb-1.5 pr-5">
                    <span
                      :class="[
                        'text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full',
                        node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                          ? 'bg-zinc-200/80 text-zinc-600'
                          : 'bg-amber-100 text-amber-800 font-extrabold'
                      ]"
                    >
                      Etapa {{ node.ordem }}
                    </span>

                    <div v-if="node.status !== 'CONCLUIDO' && !node.dataSaida" class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </div>
                    <Check v-else :size="14" class="text-emerald-600 font-bold" />
                  </div>

                  <!-- Nome do Setor -->
                  <h4 class="text-xs font-extrabold text-zinc-900 uppercase tracking-tight text-left flex items-center justify-between">
                    <span>{{ node.nome }}</span>
                  </h4>

                  <!-- Temporizador SLA / Duração Consolidada -->
                  <div class="mt-3 pt-2.5 border-t border-zinc-200/60 flex flex-col gap-1">
                    <div v-if="node.status === 'CONCLUIDO' || Boolean(node.dataSaida)" class="text-[11px] font-mono text-zinc-500 font-medium">
                      {{ formatPermanencia(node.tempoPermanenciaMin) }}
                    </div>

                    <div v-else class="flex flex-col gap-1">
                      <div class="flex items-center justify-between gap-1 text-[11px]">
                        <span class="text-zinc-500 font-mono text-[10px]">SLA Ativo:</span>
                        <div
                          :class="[
                            'font-mono font-bold flex items-center gap-1',
                            getElapsedTimeInfo(node).isOverdue
                              ? 'text-red-600 font-black animate-pulse'
                              : 'text-amber-700'
                          ]"
                        >
                          <AlertTriangle v-if="getElapsedTimeInfo(node).isOverdue" :size="12" class="text-red-600" />
                          <Clock v-else :size="12" class="text-amber-600" />
                          <span>{{ getElapsedTimeInfo(node).text }}</span>
                        </div>
                      </div>

                      <div v-if="node.slaAlvoMin" class="text-[9px] font-mono text-zinc-400 flex justify-between">
                        <span>Meta SLA:</span>
                        <span>{{ node.slaAlvoMin }} min</span>
                      </div>
                    </div>

                    <!-- Timestamp Completo de Entrada (DD/MM às HH:MM) -->
                    <div class="text-[10px] font-mono text-zinc-400 flex justify-between mt-1 pt-1 border-t border-zinc-100">
                      <span>{{ formatDataEntradaCompleta(node.dataEntrada) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Trilha 2: Lote Principal -->
            <div class="bg-emerald-50/40 border border-emerald-300/40 rounded-2xl p-5 relative">
              <div class="flex items-center gap-2 text-emerald-800 text-xs font-mono font-bold uppercase tracking-wider mb-4">
                <PackageCheck :size="14" />
                <span>Trilha {{ ordem.possuiCaixaTeste ? '2' : '1' }} — Lote Principal</span>
              </div>

              <!-- Curva SVG da Trilha LP -->
              <svg class="absolute inset-0 pointer-events-none w-full h-full">
                <path
                  v-if="ordem.svgPathLp"
                  :ref="el => setSvgLineRef(el, `lp-${ordem.id}`)"
                  :d="ordem.svgPathLp"
                  fill="none"
                  stroke="#34d399"
                  stroke-width="2"
                  stroke-dasharray="4 4"
                />
              </svg>

              <div class="flex flex-wrap gap-4 items-center relative z-10">
                <div
                  v-for="node in ordem.nodesLp"
                  :key="node.key"
                  :ref="el => setNodeRef(el, node.key)"
                  :class="[
                    'dynamic-node-card min-w-[170px] rounded-xl p-4 transition-all duration-300 relative group',
                    node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                      ? 'bg-zinc-100/50 border border-zinc-200 text-zinc-500 opacity-80 shadow-xs'
                      : 'bg-white border border-zinc-300 text-zinc-900 shadow-md ring-2 ring-emerald-400/20'
                  ]"
                >
                  <!-- Olhinho Expansível de Auditoria -->
                  <button
                    @click="openAuditDrawer(node, ordem.codigoBarras, ordem.modelo?.nome || 'Modelo')"
                    class="absolute top-2.5 right-2.5 p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                    title="Ver Detalhes de Auditoria"
                    type="button"
                  >
                    <Eye :size="14" />
                  </button>

                  <!-- Header do Nó com Status Visual -->
                  <div class="flex items-center justify-between gap-2 mb-1.5 pr-5">
                    <span
                      :class="[
                        'text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full',
                        node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                          ? 'bg-zinc-200/80 text-zinc-600'
                          : 'bg-emerald-100 text-emerald-800 font-extrabold'
                      ]"
                    >
                      Etapa {{ node.ordem }}
                    </span>

                    <div v-if="node.status !== 'CONCLUIDO' && !node.dataSaida" class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                    <Check v-else :size="14" class="text-emerald-600 font-bold" />
                  </div>

                  <!-- Nome do Setor -->
                  <h4 class="text-xs font-extrabold text-zinc-900 uppercase tracking-tight text-left flex items-center justify-between">
                    <span>{{ node.nome }}</span>
                  </h4>

                  <!-- Temporizador SLA / Duração Consolidada -->
                  <div class="mt-3 pt-2.5 border-t border-zinc-200/60 flex flex-col gap-1">
                    <div v-if="node.status === 'CONCLUIDO' || Boolean(node.dataSaida)" class="text-[11px] font-mono text-zinc-500 font-medium">
                      {{ formatPermanencia(node.tempoPermanenciaMin) }}
                    </div>

                    <div v-else class="flex flex-col gap-1">
                      <div class="flex items-center justify-between gap-1 text-[11px]">
                        <span class="text-zinc-500 font-mono text-[10px]">SLA Ativo:</span>
                        <div
                          :class="[
                            'font-mono font-bold flex items-center gap-1',
                            getElapsedTimeInfo(node).isOverdue
                              ? 'text-red-600 font-black animate-pulse'
                              : 'text-emerald-700'
                          ]"
                        >
                          <AlertTriangle v-if="getElapsedTimeInfo(node).isOverdue" :size="12" class="text-red-600" />
                          <Clock v-else :size="12" class="text-emerald-600" />
                          <span>{{ getElapsedTimeInfo(node).text }}</span>
                        </div>
                      </div>

                      <div v-if="node.slaAlvoMin" class="text-[9px] font-mono text-zinc-400 flex justify-between">
                        <span>Meta SLA:</span>
                        <span>{{ node.slaAlvoMin }} min</span>
                      </div>
                    </div>

                    <!-- Timestamp Completo de Entrada (DD/MM às HH:MM) -->
                    <div class="text-[10px] font-mono text-zinc-400 flex justify-between mt-1 pt-1 border-t border-zinc-100">
                      <span>{{ formatDataEntradaCompleta(node.dataEntrada) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Rodapé TV -->
      <div class="pt-4 border-t border-zinc-200 flex justify-between items-center text-xs font-mono text-zinc-500">
        <span>SISTEMA ERP MODELAGEM V5.1 — PAINEL TV CHÃO DE FÁBRICA</span>
        <span>{{ now.toLocaleDateString() }} — {{ now.toLocaleTimeString() }}</span>
      </div>
    </div>

    <!-- MODO PADRÃO (DASHBOARD LIGHT MODE) -->
    <div v-else class="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <!-- Header Claro -->
      <header class="border-b border-zinc-200 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="text-left">
          <button
            @click="router.back()"
            class="text-xs font-mono text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 mb-2 cursor-pointer uppercase font-bold"
            type="button"
          >
            <ArrowLeft :size="14" /> Voltar
          </button>
          <h1 class="text-2xl md:text-3xl font-extrabold tracking-tighter text-zinc-900 uppercase text-left">
            RASTREAMENTO DE PRODUÇÃO
          </h1>
          <p class="text-xs font-mono text-zinc-500 uppercase mt-0.5">
            Monitoramento Chão de Fábrica ISO 9001
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            @click="isTvMode = true"
            class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            type="button"
          >
            <Maximize :size="14" /> Modo TV Fullscreen
          </button>

          <button
            @click="fetchOrdensEPosicoes"
            class="p-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 rounded-xl transition-colors cursor-pointer shadow-xs"
            title="Recarregar"
            type="button"
          >
            <RotateCcw :size="16" />
          </button>
        </div>
      </header>

      <!-- Painel Principal de Raias -->
      <main class="space-y-8">
        <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-4">
          <div class="w-10 h-10 border-4 border-zinc-200 border-t-emerald-600 rounded-full animate-spin"></div>
          <p class="text-zinc-500 font-mono text-xs uppercase tracking-widest">Carregando raias de produção...</p>
        </div>

        <div
          v-else-if="ordens.length === 0"
          class="p-12 border border-dashed border-zinc-300 bg-white/60 backdrop-blur-md rounded-3xl text-center max-w-xl mx-auto shadow-sm"
        >
          <Layers :size="36" class="text-zinc-400 mx-auto mb-3" />
          <h3 class="text-base font-bold text-zinc-800 uppercase tracking-tight">Nenhum Teste Ativo no Momento</h3>
          <p class="text-xs text-zinc-500 mt-2 font-mono">
            Nenhum teste ativo no momento. Inicie uma nova Ordem de Teste para visualizar o fluxo em tempo real.
          </p>
        </div>

        <!-- Raias das OPs -->
        <div v-else class="space-y-8">
          <div
            v-for="ordem in ordens"
            :key="ordem.id"
            class="bg-white/70 backdrop-blur-md border border-zinc-200/60 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative"
          >
            <!-- Identificador OP -->
            <div class="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-zinc-200/80">
              <div class="text-left">
                <span class="text-xs font-mono font-bold text-emerald-700 uppercase tracking-wider block">
                  {{ ordem.codigoBarras }}
                </span>
                <h2 class="text-2xl md:text-3xl font-extrabold tracking-tighter text-zinc-900 uppercase text-left">
                  {{ ordem.modelo?.nome || 'Modelo sem Nome' }}
                </h2>
              </div>

              <div class="flex items-center gap-2">
                <span v-if="ordem.possuiCaixaTeste" class="px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300/60 text-amber-800 text-[10px] font-mono font-bold uppercase shadow-xs">
                  Dual Track (Caixa Teste + Lote)
                </span>
                <span class="px-3 py-1 rounded-full bg-zinc-100 border border-zinc-300 text-[10px] font-mono font-bold text-zinc-700 uppercase shadow-xs">
                  {{ ordem.status }}
                </span>
              </div>
            </div>

            <!-- Trilhas e Nós que Surgem sob Bipagem -->
            <div class="space-y-6 relative">
              <!-- Trilha Superior: Caixa Teste -->
              <div v-if="ordem.possuiCaixaTeste" class="bg-amber-50/40 border border-amber-300/40 rounded-2xl p-5 relative">
                <div class="flex items-center gap-2 text-amber-800 text-xs font-mono font-bold uppercase tracking-wider mb-4">
                  <Box :size="14" />
                  <span>Trilha 1 — Caixa Teste (Fast Track)</span>
                </div>

                <!-- SVG Curve -->
                <svg class="absolute inset-0 pointer-events-none w-full h-full">
                  <path
                    v-if="ordem.svgPathCx"
                    :ref="el => setSvgLineRef(el, `cx-main-${ordem.id}`)"
                    :d="ordem.svgPathCx"
                    fill="none"
                    stroke="#fbbf24"
                    stroke-width="2"
                    stroke-dasharray="4 4"
                  />
                </svg>

                <div class="flex flex-wrap gap-4 items-center relative z-10">
                  <div
                    v-for="node in ordem.nodesCx"
                    :key="node.key"
                    :ref="el => setNodeRef(el, node.key)"
                    :class="[
                      'dynamic-node-card min-w-[170px] rounded-xl p-4 transition-all duration-300 relative group',
                      node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                        ? 'bg-zinc-100/50 border border-zinc-200 text-zinc-500 opacity-80 shadow-xs'
                        : 'bg-white border border-zinc-300 text-zinc-900 shadow-md ring-2 ring-amber-400/20'
                    ]"
                  >
                    <!-- Olhinho Expansível de Auditoria -->
                    <button
                      @click="openAuditDrawer(node, ordem.codigoBarras, ordem.modelo?.nome || 'Modelo')"
                      class="absolute top-2.5 right-2.5 p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                      title="Ver Detalhes de Auditoria"
                      type="button"
                    >
                      <Eye :size="14" />
                    </button>

                    <!-- Header do Nó com Status Visual -->
                    <div class="flex items-center justify-between gap-2 mb-1.5 pr-5">
                      <span
                        :class="[
                          'text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full',
                          node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                            ? 'bg-zinc-200/80 text-zinc-600'
                            : 'bg-amber-100 text-amber-800 font-extrabold'
                        ]"
                      >
                        Etapa {{ node.ordem }}
                      </span>

                      <div v-if="node.status !== 'CONCLUIDO' && !node.dataSaida" class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </div>
                      <Check v-else :size="14" class="text-emerald-600 font-bold" />
                    </div>

                    <!-- Nome do Setor -->
                    <h4 class="text-xs font-extrabold text-zinc-900 uppercase tracking-tight text-left flex items-center justify-between">
                      <span>{{ node.nome }}</span>
                    </h4>

                    <!-- Temporizador SLA / Duração Consolidada -->
                    <div class="mt-3 pt-2.5 border-t border-zinc-200/60 flex flex-col gap-1">
                      <div v-if="node.status === 'CONCLUIDO' || Boolean(node.dataSaida)" class="text-[11px] font-mono text-zinc-500 font-medium">
                        {{ formatPermanencia(node.tempoPermanenciaMin) }}
                      </div>

                      <div v-else class="flex flex-col gap-1">
                        <div class="flex items-center justify-between gap-1 text-[11px]">
                          <span class="text-zinc-500 font-mono text-[10px]">SLA Ativo:</span>
                          <div
                            :class="[
                              'font-mono font-bold flex items-center gap-1',
                              getElapsedTimeInfo(node).isOverdue
                                ? 'text-red-600 font-black animate-pulse'
                                : 'text-amber-700'
                            ]"
                          >
                            <AlertTriangle v-if="getElapsedTimeInfo(node).isOverdue" :size="12" class="text-red-600" />
                            <Clock v-else :size="12" class="text-amber-600" />
                            <span>{{ getElapsedTimeInfo(node).text }}</span>
                          </div>
                        </div>

                        <div v-if="node.slaAlvoMin" class="text-[9px] font-mono text-zinc-400 flex justify-between">
                          <span>Meta SLA:</span>
                          <span>{{ node.slaAlvoMin }} min</span>
                        </div>
                      </div>

                      <!-- Timestamp Completo de Entrada (DD/MM às HH:MM) -->
                      <div class="text-[10px] font-mono text-zinc-400 flex justify-between mt-1 pt-1 border-t border-zinc-100">
                        <span>{{ formatDataEntradaCompleta(node.dataEntrada) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Trilha Inferior: Lote Principal -->
              <div class="bg-emerald-50/40 border border-emerald-300/40 rounded-2xl p-5 relative">
                <div class="flex items-center gap-2 text-emerald-800 text-xs font-mono font-bold uppercase tracking-wider mb-4">
                  <PackageCheck :size="14" />
                  <span>Trilha {{ ordem.possuiCaixaTeste ? '2' : '1' }} — Lote Principal</span>
                </div>

                <!-- SVG Curve -->
                <svg class="absolute inset-0 pointer-events-none w-full h-full">
                  <path
                    v-if="ordem.svgPathLp"
                    :ref="el => setSvgLineRef(el, `lp-main-${ordem.id}`)"
                    :d="ordem.svgPathLp"
                    fill="none"
                    stroke="#34d399"
                    stroke-width="2"
                    stroke-dasharray="4 4"
                  />
                </svg>

                <div class="flex flex-wrap gap-4 items-center relative z-10">
                  <div
                    v-for="node in ordem.nodesLp"
                    :key="node.key"
                    :ref="el => setNodeRef(el, node.key)"
                    :class="[
                      'dynamic-node-card min-w-[170px] rounded-xl p-4 transition-all duration-300 relative group',
                      node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                        ? 'bg-zinc-100/50 border border-zinc-200 text-zinc-500 opacity-80 shadow-xs'
                        : 'bg-white border border-zinc-300 text-zinc-900 shadow-md ring-2 ring-emerald-400/20'
                    ]"
                  >
                    <!-- Olhinho Expansível de Auditoria -->
                    <button
                      @click="openAuditDrawer(node, ordem.codigoBarras, ordem.modelo?.nome || 'Modelo')"
                      class="absolute top-2.5 right-2.5 p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                      title="Ver Detalhes de Auditoria"
                      type="button"
                    >
                      <Eye :size="14" />
                    </button>

                    <!-- Header do Nó com Status Visual -->
                    <div class="flex items-center justify-between gap-2 mb-1.5 pr-5">
                      <span
                        :class="[
                          'text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full',
                          node.status === 'CONCLUIDO' || Boolean(node.dataSaida)
                            ? 'bg-zinc-200/80 text-zinc-600'
                            : 'bg-emerald-100 text-emerald-800 font-extrabold'
                        ]"
                      >
                        Etapa {{ node.ordem }}
                      </span>

                      <div v-if="node.status !== 'CONCLUIDO' && !node.dataSaida" class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </div>
                      <Check v-else :size="14" class="text-emerald-600 font-bold" />
                    </div>

                    <!-- Nome do Setor -->
                    <h4 class="text-xs font-extrabold text-zinc-900 uppercase tracking-tight text-left flex items-center justify-between">
                      <span>{{ node.nome }}</span>
                    </h4>

                    <!-- Temporizador SLA / Duração Consolidada -->
                    <div class="mt-3 pt-2.5 border-t border-zinc-200/60 flex flex-col gap-1">
                      <div v-if="node.status === 'CONCLUIDO' || Boolean(node.dataSaida)" class="text-[11px] font-mono text-zinc-500 font-medium">
                        {{ formatPermanencia(node.tempoPermanenciaMin) }}
                      </div>

                      <div v-else class="flex flex-col gap-1">
                        <div class="flex items-center justify-between gap-1 text-[11px]">
                          <span class="text-zinc-500 font-mono text-[10px]">SLA Ativo:</span>
                          <div
                            :class="[
                              'font-mono font-bold flex items-center gap-1',
                              getElapsedTimeInfo(node).isOverdue
                                ? 'text-red-600 font-black animate-pulse'
                                : 'text-emerald-700'
                            ]"
                          >
                            <AlertTriangle v-if="getElapsedTimeInfo(node).isOverdue" :size="12" class="text-red-600" />
                            <Clock v-else :size="12" class="text-emerald-600" />
                            <span>{{ getElapsedTimeInfo(node).text }}</span>
                          </div>
                        </div>

                        <div v-if="node.slaAlvoMin" class="text-[9px] font-mono text-zinc-400 flex justify-between">
                          <span>Meta SLA:</span>
                          <span>{{ node.slaAlvoMin }} min</span>
                        </div>
                      </div>

                      <!-- Timestamp Completo de Entrada (DD/MM às HH:MM) -->
                      <div class="text-[10px] font-mono text-zinc-400 flex justify-between mt-1 pt-1 border-t border-zinc-100">
                        <span>{{ formatDataEntradaCompleta(node.dataEntrada) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.font-sf-rounded {
  font-family: 'SF Pro Rounded', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
