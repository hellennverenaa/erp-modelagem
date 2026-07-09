<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  X,
  Package,
  AlertCircle,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  BarChart3,
  Activity,
  MapPin,
  LogIn,
  LogOut,
  Timer,
  ChevronRight,
  Info,
  Printer
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface OrdemTeste {
  id: string
  codigoBarras: string
  modeloId: string
  plantaId: string
  prioridadePcp: string
  status: string
  liberadoProducao: boolean
  possuiCaixaTeste: boolean
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

interface Modelo {
  id: string
  nome: string
  codigoProduto: string
}

interface Planta {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface SetorInfo {
  id: string
  nome: string
  tipoSetor?: string | null
}

interface OperadorInfo {
  id: string
  nomeCompleto: string
  usuario: string
}

interface RastreamentoHistorico {
  id: string
  ordemTesteId: string
  setorId: string
  tipoLote: string
  dataEntrada: string | null
  dataSaida: string | null
  tempoPermanenciaMin: number | null
  status: string
  setor: SetorInfo | null
  operadorEntrada: OperadorInfo | null
  operadorSaida: OperadorInfo | null
}

interface HistoricoResponse {
  ordemTesteId: string
  total: number
  historico: RastreamentoHistorico[]
}

// ─── Estado Reativo ────────────────────────────────────────────
const router = useRouter()
const ordens = ref<OrdemTeste[]>([])
const modelos = ref<Modelo[]>([])
const catalogoModelos = ref<Modelo[]>([])
const plantas = ref<Planta[]>([])

const loading = ref(true)
const loadingCreate = ref(false)
const showModal = ref(false)
const searchQuery = ref('')
const toasts = ref<Toast[]>([])

// ─── Resolução de Nomes do Catálogo ───────────────────────────────────
function getModeloNome(modeloId: string) {
  const m = catalogoModelos.value.find(x => x.id === modeloId)
  return m ? m.nome : `Modelo #${modeloId.substring(0, 8)}`
}

function getModeloReferencia(modeloId: string) {
  const m = catalogoModelos.value.find(x => x.id === modeloId)
  return m ? m.codigoProduto : 'N/A'
}
let toastCounter = 0

// ─── Timeline / Drawer de Rastreamento ──────────────────────────────
const showTimeline = ref(false)
const timelineOrdem = ref<OrdemTeste | null>(null)
const timelineData = ref<RastreamentoHistorico[]>([])
const loadingTimeline = ref(false)
const loadingPdfId = ref<string | null>(null)
const user = computed(() => authStore.user.value)

async function imprimirOrdem(ordem: OrdemTeste, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL' = 'LOTE_PRINCIPAL') {
  if (loadingPdfId.value) return
  
  loadingPdfId.value = `${ordem.id}-${tipoLote}`
  try {
    const response = await api.post('/etiquetas/gerar', {
      ordemTesteIds: [ordem.id],
      setorId: user.value?.setorId || 'ecb2d21d-51db-41a7-8261-17e8a5f03fed',
      tipoLote
    }, {
      responseType: 'blob'
    })
    
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const pdfUrl = window.URL.createObjectURL(blob)
    window.open(pdfUrl, '_blank')
    
    setTimeout(() => {
      window.URL.revokeObjectURL(pdfUrl)
    }, 60000)
  } catch (err) {
    console.error('[Imprimir] Erro ao gerar etiquetas em PDF:', err)
    addToast('error', 'Erro ao gerar etiqueta em PDF.')
  } finally {
    loadingPdfId.value = null
  }
}

async function openTimeline(ordem: OrdemTeste) {
  timelineOrdem.value = ordem
  timelineData.value = []
  showTimeline.value = true
  loadingTimeline.value = true
  try {
    const { data } = await api.get<HistoricoResponse>(`/rastreamentos/historico/${ordem.id}`)
    timelineData.value = data.historico ?? []
  } catch {
    addToast('error', 'Erro ao carregar histórico de rastreamento.')
    showTimeline.value = false
  } finally {
    loadingTimeline.value = false
  }
}

function closeTimeline() {
  showTimeline.value = false
  timelineOrdem.value = null
  timelineData.value = []
}

// Config visual dos status de rastreamento
const rastreamentoStatusConfig: Record<string, { label: string; cls: string; dotCls: string }> = {
  EM_PROCESSO:   { label: 'Em Processo',    cls: 'rstat--amber',  dotCls: 'rdot--amber'  },
  CONCLUIDO:     { label: 'Concluído',       cls: 'rstat--green',  dotCls: 'rdot--green'  },
  REPROVADO:     { label: 'Reprovado',       cls: 'rstat--red',    dotCls: 'rdot--red'    },
  EM_RETRABALHO: { label: 'Em Retrabalho',  cls: 'rstat--orange', dotCls: 'rdot--orange' },
}

function getRastreamentoStatus(s: string) {
  return rastreamentoStatusConfig[s] ?? { label: s, cls: 'rstat--slate', dotCls: 'rdot--slate' }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatPermanencia(min: number | null) {
  if (min === null || min === undefined) return null
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ─── Formulário ──────────────────────────────────────────────────────────────
const form = ref({
  modeloId: '',
  plantaId: '',
  prioridadePcp: '',
  observacoes: '',
})
const formErrors = ref<Record<string, string>>({})

// ─── Helpers de Status ───────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; cls: string }> = {
  AGUARDANDO_MATERIAL:        { label: 'Aguardando Material',    cls: 'badge--amber' },
  CONFERENCIA_INICIAL:        { label: 'Conferência Inicial',    cls: 'badge--blue' },
  AGUARDANDO_VALIDACAO:       { label: 'Aguardando Validação',   cls: 'badge--amber' },
  EM_CORTE:                   { label: 'Em Corte',               cls: 'badge--blue' },
  INSPECAO_QUALIDADE:         { label: 'Inspeção Qualidade',     cls: 'badge--violet' },
  EM_RETRABALHO:              { label: 'Em Retrabalho',          cls: 'badge--orange' },
  SERIGRAFIA:                 { label: 'Serigrafia',             cls: 'badge--blue' },
  APOIO:                      { label: 'Apoio',                  cls: 'badge--blue' },
  BORDADO:                    { label: 'Bordado',                cls: 'badge--blue' },
  COSTURA_PROGRAMADA:         { label: 'Costura Programada',     cls: 'badge--blue' },
  COSTURA:                    { label: 'Costura',                cls: 'badge--blue' },
  PRE_FABRICADO:              { label: 'Pré-fabricado',          cls: 'badge--blue' },
  MONTAGEM:                   { label: 'Montagem',               cls: 'badge--indigo' },
  VULCANIZADO:                { label: 'Vulcanizado',            cls: 'badge--indigo' },
  LABORATORIO:                { label: 'Laboratório',            cls: 'badge--violet' },
  AGUARDANDO_RESULTADO_FINAL: { label: 'Aguardando Resultado',   cls: 'badge--amber' },
  APROVACAO_CONCESSAO:        { label: 'Aprovação/Concessão',    cls: 'badge--amber' },
  APROVADO:                   { label: 'Aprovado',               cls: 'badge--green' },
  REPROVADO:                  { label: 'Reprovado',              cls: 'badge--red' },
  LIBERADO_PRODUCAO:          { label: 'Liberado Produção',      cls: 'badge--green' },
}

const prioridadeConfig: Record<string, { label: string; cls: string }> = {
  ALTA:  { label: 'Alta',  cls: 'badge--red' },
  MEDIA: { label: 'Média', cls: 'badge--amber' },
  BAIXA: { label: 'Baixa', cls: 'badge--slate' },
}

function getStatus(s: string) {
  return statusConfig[s] ?? { label: s, cls: 'badge--slate' }
}
function getPrioridade(p: string) {
  return prioridadeConfig[p] ?? { label: p, cls: 'badge--slate' }
}

// ─── Computed ────────────────────────────────────────────────────────────────
const filteredOrdens = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return ordens.value
  return ordens.value.filter(
    (o) =>
      o.codigoBarras.toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q) ||
      o.prioridadePcp.toLowerCase().includes(q)
  )
})

const stats = computed(() => ({
  total: ordens.value.length,
  emAndamento: ordens.value.filter(
    (o) => !['APROVADO', 'REPROVADO', 'LIBERADO_PRODUCAO'].includes(o.status)
  ).length,
  aprovados: ordens.value.filter((o) => o.status === 'APROVADO' || o.status === 'LIBERADO_PRODUCAO').length,
  alta: ordens.value.filter((o) => o.prioridadePcp === 'ALTA').length,
}))

// ─── Toast ───────────────────────────────────────────────────────────────────
function addToast(type: 'success' | 'error', message: string) {
  const id = ++toastCounter
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

// ─── Requisições ─────────────────────────────────────────────────────────────
async function fetchOrdens() {
  loading.value = true
  try {
    const { data } = await api.get<OrdemTeste[]>('/lotes')
    ordens.value = data
  } catch {
    addToast('error', 'Erro ao carregar ordens de produção.')
  } finally {
    loading.value = false
  }
}

async function fetchDropdownData() {
  try {
    const [resModelos, resPlantas, resCatalogo] = await Promise.all([
      // Endpoint filtrado: retorna apenas modelos SEM ordem de teste (regra 1:1)
      api.get<Modelo[]>('/admin/modelos'),
      api.get<Planta[]>('/admin/plantas'),
      api.get<Modelo[]>('/admin/modelos/catalogo'),
    ])
    modelos.value = resModelos.data
    plantas.value = resPlantas.data
    catalogoModelos.value = resCatalogo.data
  } catch {
    addToast('error', 'Erro ao carregar opções do formulário.')
  }
}

async function handleCreateOrdem() {
  formErrors.value = {}

  if (!form.value.modeloId)      formErrors.value.modeloId = 'Selecione um modelo.'
  if (!form.value.plantaId)      formErrors.value.plantaId = 'Selecione uma planta.'
  if (!form.value.prioridadePcp) formErrors.value.prioridadePcp = 'Selecione a prioridade.'

  if (Object.keys(formErrors.value).length > 0) return

  loadingCreate.value = true
  try {
    await api.post('/lotes', {
      modeloId:      form.value.modeloId,
      plantaId:      form.value.plantaId,
      prioridadePcp: form.value.prioridadePcp,
      observacoes:   form.value.observacoes || null,
    })
    addToast('success', 'Ordem de teste criada com sucesso.')
    // Recarrega dropdown para remover o modelo que agora tem ordem ativa
    await Promise.all([fetchOrdens(), fetchDropdownData()])
    closeModal()
  } catch (err: any) {
    const code = err?.response?.data?.code
    const serverMsg = err?.response?.data?.error

    // Trata o erro específico da regra 1:1
    if (code === 'MODELO_TESTE_DUPLICADO') {
      const cb = err?.response?.data?.codigoBarras
      addToast('error', cb
        ? `Este modelo já possui a ordem ativa: ${cb}. Cada modelo admite apenas um teste de produção.`
        : 'Este modelo já possui um teste de produção ativo. Regra 1:1.'
      )
    } else {
      addToast('error', typeof serverMsg === 'string'
        ? serverMsg
        : 'Erro ao criar ordem. Verifique os dados e tente novamente.'
      )
    }
  } finally {
    loadingCreate.value = false
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal() {
  form.value = { modeloId: '', plantaId: '', prioridadePcp: '', observacoes: '' }
  formErrors.value = {}
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchOrdens(), fetchDropdownData()])
})
</script>

<template>
  <div class="go-root">

    <!-- ── Toast Stack ────────────────────────────────────── -->
    <Teleport to="body">
      <div class="toast-stack" aria-live="polite">
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="toast"
            :class="toast.type === 'success' ? 'toast--success' : 'toast--error'"
            role="alert"
          >
            <CheckCircle2 v-if="toast.type === 'success'" :size="16" class="toast-icon" aria-hidden="true" />
            <XCircle      v-else                          :size="16" class="toast-icon" aria-hidden="true" />
            <span class="toast-msg">{{ toast.message }}</span>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- ── PAGE HEADER ────────────────────────────────────── -->
    <header class="go-header">
      <div class="go-header-left">
        <div class="page-icon-wrap" aria-hidden="true">
          <ClipboardList :size="20" />
        </div>
        <div>
          <h1 class="go-title">Gestão de Ordens de Teste</h1>
          <p class="go-subtitle">Crie e acompanhe as ordens de produção que geram códigos de barras para o chão de fábrica.</p>
        </div>
      </div>
      <div class="go-header-actions">
        <button
          id="btn-refresh-ordens"
          type="button"
          class="btn-ghost"
          :disabled="loading"
          @click="fetchOrdens"
          aria-label="Recarregar ordens"
        >
          <RefreshCw :size="15" :class="{ 'spin-anim': loading }" aria-hidden="true" />
        </button>
        <button
          id="btn-nova-ordem"
          type="button"
          class="btn-primary"
          @click="openModal"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>Nova Ordem de Teste</span>
        </button>
      </div>
    </header>

    <!-- ── KPI STRIP ──────────────────────────────────────── -->
    <section class="kpi-strip" aria-label="Estatísticas de ordens">
      <div class="kpi-card">
        <BarChart3 :size="18" class="kpi-icon" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.total }}</span>
          <span class="kpi-lbl">Total</span>
        </div>
      </div>
      <div class="kpi-card">
        <RefreshCw :size="18" class="kpi-icon kpi-icon--blue" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.emAndamento }}</span>
          <span class="kpi-lbl">Em Andamento</span>
        </div>
      </div>
      <div class="kpi-card">
        <CheckCircle2 :size="18" class="kpi-icon kpi-icon--green" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.aprovados }}</span>
          <span class="kpi-lbl">Aprovadas</span>
        </div>
      </div>
      <div class="kpi-card">
        <AlertCircle :size="18" class="kpi-icon kpi-icon--red" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.alta }}</span>
          <span class="kpi-lbl">Prioridade Alta</span>
        </div>
      </div>
    </section>

    <!-- ── TOOLBAR ────────────────────────────────────────── -->
    <div class="go-toolbar">
      <div class="search-wrap">
        <Search :size="15" class="search-icon" aria-hidden="true" />
        <input
          id="input-search-ordens"
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Buscar por código, status ou prioridade..."
          aria-label="Buscar ordens"
        />
      </div>
    </div>

    <!-- ── TABLE ──────────────────────────────────────────── -->
    <div class="table-card">
      <!-- Loading skeleton -->
      <div v-if="loading" class="table-loading" aria-label="Carregando ordens...">
        <div v-for="i in 5" :key="i" class="skeleton-row">
          <div class="skel skel--code"></div>
          <div class="skel skel--mid"></div>
          <div class="skel skel--short"></div>
          <div class="skel skel--short"></div>
          <div class="skel skel--short"></div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredOrdens.length === 0" class="table-empty">
        <Package :size="40" class="empty-icon" aria-hidden="true" />
        <p class="empty-title">Nenhuma ordem encontrada</p>
        <p class="empty-sub">Crie a primeira ordem de teste clicando em "Nova Ordem de Teste".</p>
      </div>

      <!-- Data table -->
      <div v-else class="table-outer" role="region" aria-label="Tabela de ordens de produção">
        <table class="go-table">
          <thead>
            <tr>
              <th scope="col">Código de Barras</th>
              <th scope="col">ID do Modelo</th>
              <th scope="col" class="text-center">Prioridade PCP</th>
              <th scope="col" class="text-center">Status</th>
              <th scope="col" class="text-center">Liberado</th>
              <th scope="col">Criado em</th>
              <th scope="col" class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ordem in filteredOrdens" :key="ordem.id" class="go-row">
              <td>
                <span class="barcode-cell">{{ ordem.codigoBarras }}</span>
              </td>
              <td>
                <div class="model-info-cell">
                  <strong class="model-name-text">{{ getModeloNome(ordem.modeloId) }}</strong>
                  <span class="model-ref-sub">Ref: {{ getModeloReferencia(ordem.modeloId) }}</span>
                </div>
              </td>
              <td class="text-center">
                <span class="badge" :class="getPrioridade(ordem.prioridadePcp).cls">
                  {{ getPrioridade(ordem.prioridadePcp).label }}
                </span>
              </td>
              <td class="text-center">
                <span class="badge" :class="getStatus(ordem.status).cls">
                  {{ getStatus(ordem.status).label }}
                </span>
              </td>
              <td class="text-center">
                <span
                  class="liberado-dot"
                  :class="ordem.liberadoProducao ? 'liberado-dot--yes' : 'liberado-dot--no'"
                  :aria-label="ordem.liberadoProducao ? 'Liberado para produção' : 'Não liberado'"
                ></span>
              </td>
              <td class="date-cell">{{ formatDate(ordem.createdAt) }}</td>
              <td class="text-center">
                <div class="actions-flex">
                  <button
                    :id="`btn-timeline-${ordem.id}`"
                    type="button"
                    class="btn-action-timeline"
                    @click="openTimeline(ordem)"
                    :aria-label="`Ver timeline de rastreamento da ordem ${ordem.codigoBarras}`"
                    title="Ver Timeline de Rastreamento"
                  >
                    <Activity :size="14" aria-hidden="true" />
                    <span>Timeline</span>
                  </button>
                  <button
                    type="button"
                    class="btn-action-timeline"
                    style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid #bae6fd;"
                    @click="router.push({ name: 'rastreamento-ordem', params: { ordemTesteId: ordem.id } })"
                    title="Ver Rastreamento Dual Dinâmico"
                  >
                    <Activity :size="14" aria-hidden="true" />
                    <span>Rastrear Dual</span>
                  </button>
                  <template v-if="ordem.possuiCaixaTeste">
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'LOTE_PRINCIPAL')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` || loadingPdfId === `${ordem.id}-CAIXA_TESTE`"
                      :aria-label="`Imprimir etiqueta de lote da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Lote"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` ? 'Gerando...' : 'Lote' }}</span>
                    </button>
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'CAIXA_TESTE')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` || loadingPdfId === `${ordem.id}-CAIXA_TESTE`"
                      :aria-label="`Imprimir etiqueta de caixa teste da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Caixa Teste"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-CAIXA_TESTE`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-CAIXA_TESTE` ? 'Gerando...' : 'Caixa Teste' }}</span>
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'LOTE_PRINCIPAL')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`"
                      :aria-label="`Imprimir etiqueta da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Lote"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` ? 'Gerando...' : 'Imprimir' }}</span>
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer count -->
      <div v-if="!loading && filteredOrdens.length > 0" class="table-footer">
        <span>{{ filteredOrdens.length }} ordem{{ filteredOrdens.length !== 1 ? 's' : '' }} exibida{{ filteredOrdens.length !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         MODAL — NOVA ORDEM DE TESTE
    ══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-ordens"
          @click.self="closeModal"
        >
          <div class="modal-panel">
            <!-- Modal Header -->
            <div class="modal-header">
              <div class="modal-header-left">
                <div class="modal-icon-wrap" aria-hidden="true">
                  <Plus :size="18" />
                </div>
                <h2 id="modal-title-ordens" class="modal-title">Nova Ordem de Teste</h2>
              </div>
              <button
                id="btn-close-modal-ordens"
                type="button"
                class="modal-close"
                @click="closeModal"
                aria-label="Fechar modal"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <!-- Modal Body -->
            <div class="modal-body">
              <p class="modal-description">
                Selecione o modelo de calçado, a planta industrial e a prioridade PCP para gerar automaticamente o código de barras da ordem de rastreamento.
              </p>

              <!-- Modelo -->
              <div class="form-field">
                <label for="sel-modelo" class="form-label">
                  Modelo de Calçado <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-modelo"
                    v-model="form.modeloId"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.modeloId }"
                  >
                    <option value="" disabled>Selecione um modelo...</option>
                    <option v-for="m in modelos" :key="m.id" :value="m.id">
                      {{ m.codigoProduto }} — {{ m.nome }}
                    </option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.modeloId" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.modeloId }}
                </span>
              </div>

              <!-- Planta -->
              <div class="form-field">
                <label for="sel-planta" class="form-label">
                  Planta Industrial <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-planta"
                    v-model="form.plantaId"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.plantaId }"
                  >
                    <option value="" disabled>Selecione uma planta...</option>
                    <option v-for="p in plantas" :key="p.id" :value="p.id">
                      {{ p.nome }}<template v-if="p.cidade"> — {{ p.cidade }}{{ p.estado ? `/${p.estado}` : '' }}</template>
                    </option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.plantaId" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.plantaId }}
                </span>
              </div>

              <!-- Prioridade PCP -->
              <div class="form-field">
                <label for="sel-prioridade" class="form-label">
                  Prioridade PCP <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-prioridade"
                    v-model="form.prioridadePcp"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.prioridadePcp }"
                  >
                    <option value="" disabled>Selecione a prioridade...</option>
                    <option value="ALTA">Alta — Entrega urgente</option>
                    <option value="MEDIA">Média — Prazo padrão</option>
                    <option value="BAIXA">Baixa — Sem urgência</option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.prioridadePcp" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.prioridadePcp }}
                </span>
              </div>

              <!-- Observações (opcional) -->
              <div class="form-field">
                <label for="txt-observacoes" class="form-label">Observações <span class="optional-tag">opcional</span></label>
                <textarea
                  id="txt-observacoes"
                  v-model="form.observacoes"
                  class="form-textarea"
                  placeholder="Anotações adicionais sobre esta ordem..."
                  rows="3"
                ></textarea>
              </div>

              <!-- Info tip -->
              <div class="info-tip" role="note">
                <AlertCircle :size="14" class="tip-icon" aria-hidden="true" />
                <span>O código de barras será gerado automaticamente. Apenas modelos <strong>sem teste ativo</strong> aparecem na lista (regra 1:1).</span>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="modal-footer">
              <button
                id="btn-cancel-ordem"
                type="button"
                class="btn-outline"
                @click="closeModal"
                :disabled="loadingCreate"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-ordem"
                type="button"
                class="btn-primary"
                @click="handleCreateOrdem"
                :disabled="loadingCreate"
              >
                <Loader2 v-if="loadingCreate" :size="15" class="spin-anim" aria-hidden="true" />
                <Plus v-else :size="15" aria-hidden="true" />
                <span>{{ loadingCreate ? 'Criando Ordem...' : 'Confirmar e Criar' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ══════════════════════════════════════════════════════
         DRAWER — TIMELINE DE RASTREAMENTO
    ══════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="showTimeline"
          class="tl-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tl-drawer-title"
          @click.self="closeTimeline"
        >
          <aside class="tl-drawer">

            <!-- Drawer Header -->
            <div class="tl-header">
              <div class="tl-header-left">
                <div class="tl-icon-wrap" aria-hidden="true">
                  <Activity :size="18" />
                </div>
                <div>
                  <h2 id="tl-drawer-title" class="tl-title">Timeline de Rastreamento</h2>
                  <p class="tl-subtitle" v-if="timelineOrdem">
                    Ordem
                    <span class="tl-code">{{ timelineOrdem.codigoBarras }}</span>
                  </p>
                </div>
              </div>
              <button
                id="btn-close-timeline"
                type="button"
                class="tl-close"
                @click="closeTimeline"
                aria-label="Fechar timeline"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <!-- Drawer Body -->
            <div class="tl-body">

              <!-- Loading state -->
              <div v-if="loadingTimeline" class="tl-loading" aria-label="Carregando rastreamentos...">
                <div v-for="i in 4" :key="i" class="tl-skel-row">
                  <div class="tl-skel-dot"></div>
                  <div class="tl-skel-content">
                    <div class="tl-skel tl-skel--title"></div>
                    <div class="tl-skel tl-skel--sub"></div>
                    <div class="tl-skel tl-skel--sub"></div>
                  </div>
                </div>
              </div>

              <!-- Empty state -->
              <div v-else-if="timelineData.length === 0" class="tl-empty">
                <MapPin :size="32" class="tl-empty-icon" aria-hidden="true" />
                <p class="tl-empty-title">Nenhum rastreamento registrado</p>
                <p class="tl-empty-sub">A bipagem das peças nesta ordem ainda não foi iniciada no chão de fábrica.</p>
              </div>

              <!-- Timeline list -->
              <ol v-else class="tl-list" aria-label="Histórico de rastreamento por setor">
                <li
                  v-for="(item, idx) in timelineData"
                  :key="item.id"
                  class="tl-item"
                >
                  <!-- Conector vertical (oculta no último) -->
                  <div class="tl-connector" :class="{ 'tl-connector--hidden': idx === timelineData.length - 1 }" aria-hidden="true"></div>

                  <!-- Bolha de status -->
                  <div
                    class="tl-dot"
                    :class="getRastreamentoStatus(item.status).dotCls"
                    :aria-label="getRastreamentoStatus(item.status).label"
                  ></div>

                  <!-- Card do rastreamento -->
                  <div class="tl-card">
                    <!-- Setor + badge -->
                    <div class="tl-card-header">
                      <div class="tl-setor-wrap">
                        <MapPin :size="12" class="tl-setor-icon" aria-hidden="true" />
                        <span class="tl-setor-nome">{{ item.setor?.nome ?? 'Setor desconhecido' }}</span>
                        <span v-if="item.setor?.tipoSetor" class="tl-tipo-setor">{{ item.setor.tipoSetor }}</span>
                      </div>
                      <span class="tl-badge" :class="getRastreamentoStatus(item.status).cls">
                        {{ getRastreamentoStatus(item.status).label }}
                      </span>
                    </div>

                    <!-- Tipo de lote -->
                    <div class="tl-lote-tag">
                      <ChevronRight :size="10" aria-hidden="true" />
                      {{ item.tipoLote === 'CAIXA_TESTE' ? 'Caixa Teste' : 'Lote Principal' }}
                    </div>

                    <!-- Datas -->
                    <div class="tl-dates">
                      <div class="tl-date-row">
                        <LogIn :size="12" class="tl-date-icon" aria-hidden="true" />
                        <span class="tl-date-label">Entrada:</span>
                        <span class="tl-date-val">{{ formatDateTime(item.dataEntrada) }}</span>
                      </div>
                      <div class="tl-date-row">
                        <LogOut :size="12" class="tl-date-icon" aria-hidden="true" />
                        <span class="tl-date-label">Saída:</span>
                        <span class="tl-date-val">{{ formatDateTime(item.dataSaida) }}</span>
                      </div>
                    </div>

                    <!-- Tempo de permanência -->
                    <div v-if="formatPermanencia(item.tempoPermanenciaMin)" class="tl-permanencia">
                      <Timer :size="12" class="tl-perm-icon" aria-hidden="true" />
                      <span class="tl-perm-label">Permanência:</span>
                      <span class="tl-perm-val">{{ formatPermanencia(item.tempoPermanenciaMin) }}</span>
                    </div>

                    <!-- Operadores -->
                    <div v-if="item.operadorEntrada || item.operadorSaida" class="tl-operadores">
                      <div v-if="item.operadorEntrada" class="tl-op">
                        <span class="tl-op-tag">Entrada</span>
                        <span class="tl-op-nome">{{ item.operadorEntrada.nomeCompleto }}</span>
                      </div>
                      <div v-if="item.operadorSaida" class="tl-op">
                        <span class="tl-op-tag">Saída</span>
                        <span class="tl-op-nome">{{ item.operadorSaida.nomeCompleto }}</span>
                      </div>
                    </div>
                  </div>
                </li>
              </ol>

            </div>

            <!-- Drawer Footer -->
            <div class="tl-footer">
              <div class="tl-footer-info" v-if="!loadingTimeline && timelineData.length > 0">
                <Info :size="13" aria-hidden="true" />
                <span>{{ timelineData.length }} rastreamento{{ timelineData.length !== 1 ? 's' : '' }} registrado{{ timelineData.length !== 1 ? 's' : '' }}</span>
              </div>
              <button
                id="btn-fechar-timeline-footer"
                type="button"
                class="btn-outline"
                @click="closeTimeline"
              >
                Fechar
              </button>
            </div>

          </aside>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════
   DESIGN SYSTEM — GESTÃO DE ORDENS
   Estética: Industrial Utilitarian + Light Mode Antirreflexo
   Paleta: slate-50 base · slate-900 texto · blue-700 accent
══════════════════════════════════════════════════════ */

/* ─── Root ─────────────────────────────────────────── */
.go-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 100%;
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}

/* ─── Page Header ──────────────────────────────────── */
.go-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.go-header-left {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.page-icon-wrap {
  width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.3);
}

.go-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.025em;
  line-height: 1.2;
  margin: 0;
}

.go-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.25rem 0 0;
  line-height: 1.5;
}

.go-header-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-shrink: 0;
}

/* ─── Buttons ──────────────────────────────────────── */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  font-size: 0.875rem;
  font-weight: 700;
  font-family: inherit;
  color: #fff;
  background: #0f172a;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
}

.btn-primary:hover:not(:disabled) { background: #1e293b; transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  color: #475569;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-outline:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; }
.btn-outline:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-outline:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

/* ─── KPI Strip ────────────────────────────────────── */
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.875rem;
}

@media (max-width: 900px) { .kpi-strip { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .kpi-strip { grid-template-columns: 1fr; } }

.kpi-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem 1.125rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.kpi-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
.kpi-icon--blue  { color: #2563eb; }
.kpi-icon--green { color: #16a34a; }
.kpi-icon--red   { color: #dc2626; }

.kpi-data {
  display: flex;
  flex-direction: column;
}

.kpi-val {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.kpi-lbl {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  margin-top: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ─── Toolbar ──────────────────────────────────────── */
.go-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.search-wrap {
  position: relative;
  flex: 1;
  max-width: 28rem;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.5625rem 0.875rem 0.5625rem 2.25rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.search-input::placeholder { color: #94a3b8; }

/* ─── Table Card ───────────────────────────────────── */
.table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

/* Loading Skeletons */
.table-loading {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.skel {
  height: 1rem;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
}

.skel--code  { width: 10rem; }
.skel--mid   { width: 8rem; }
.skel--short { width: 5rem; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty state */
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3.5rem 2rem;
  text-align: center;
}

.empty-icon { color: #cbd5e1; margin-bottom: 0.25rem; }
.empty-title { font-size: 1rem; font-weight: 700; color: #334155; }
.empty-sub { font-size: 0.875rem; color: #94a3b8; max-width: 28rem; line-height: 1.5; }

/* Table */
.table-outer {
  overflow-x: auto;
}

.go-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.go-table thead tr {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.go-table th {
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.go-row {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.12s;
}
.go-row:hover { background: #f8fafc; }
.go-row:last-child { border-bottom: none; }

.go-table td {
  padding: 0.875rem 1rem;
  color: #0f172a;
  vertical-align: middle;
}

.text-center { text-align: center !important; }

.barcode-cell {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #0f172a;
  background: #f1f5f9;
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  white-space: nowrap;
}

.id-cell {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #64748b;
}

.date-cell {
  font-size: 0.8125rem;
  color: #64748b;
  white-space: nowrap;
}

/* ─── Badges ───────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 0.2rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--green  { background: #dcfce7; color: #15803d; }
.badge--red    { background: #fee2e2; color: #b91c1c; }
.badge--amber  { background: #fef3c7; color: #b45309; }
.badge--orange { background: #ffedd5; color: #c2410c; }
.badge--blue   { background: #dbeafe; color: #1d4ed8; }
.badge--indigo { background: #e0e7ff; color: #4338ca; }
.badge--violet { background: #ede9fe; color: #6d28d9; }
.badge--slate  { background: #f1f5f9; color: #475569; }

/* Liberado dot indicator */
.liberado-dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}
.liberado-dot--yes { background: #16a34a; box-shadow: 0 0 0 2px #dcfce7; }
.liberado-dot--no  { background: #cbd5e1; }

/* Table footer */
.table-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid #f1f5f9;
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
  text-align: right;
}

/* ─── Modal ────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  width: 100%;
  max-width: 30rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

.modal-close {
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.modal-close:hover { background: #f1f5f9; color: #0f172a; }
.modal-close:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  overflow-y: auto;
}

.modal-description {
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
}

/* ─── Form Fields ──────────────────────────────────── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.required-star { color: #dc2626; }
.optional-tag {
  font-size: 0.7rem;
  font-weight: 500;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 0.05rem 0.4rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.select-wrap {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 0.5625rem 2.25rem 0.5625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.form-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.form-select--error { border-color: #dc2626; }
.form-select--error:focus { box-shadow: 0 0 0 3px rgba(220,38,38,0.12); }

.select-chevron {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #dc2626;
}

.form-textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  resize: vertical;
  min-height: 5rem;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  line-height: 1.5;
}
.form-textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.form-textarea::placeholder { color: #94a3b8; }

.info-tip {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  color: #1d4ed8;
  line-height: 1.5;
}

.tip-icon { flex-shrink: 0; margin-top: 0.05rem; }

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 1.125rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}

/* ─── Toast ────────────────────────────────────────── */
.toast-stack {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 99999;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.125rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  max-width: 22rem;
  pointer-events: auto;
}

.toast--success { background: #0f172a; color: #dcfce7; }
.toast--error   { background: #7f1d1d; color: #fee2e2; }

.toast-icon { flex-shrink: 0; }
.toast-msg  { line-height: 1.4; }

/* ─── Animations ───────────────────────────────────── */
.spin-anim {
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal transitions */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-panel, .modal-leave-active .modal-panel {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease;
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel {
  transform: translateY(1.5rem) scale(0.97);
  opacity: 0;
}

/* Toast transitions */
.toast-enter-active  { transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.toast-leave-active  { transition: all 0.25s ease; }
.toast-enter-from    { opacity: 0; transform: translateX(1.5rem); }
.toast-leave-to      { opacity: 0; transform: translateX(1.5rem); }

/* ─── Botão de ação — Timeline ─────────────────────────────── */
.btn-action-timeline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.btn-action-timeline:hover { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.btn-action-timeline:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

/* ═══════════════════════════════════════════════════════════════
   DRAWER — TIMELINE DE RASTREAMENTO (PAINEL E)
   Light Mode Industrial, slide da direita
═══════════════════════════════════════════════════════════════ */
.tl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  z-index: 9998;
  display: flex;
  justify-content: flex-end;
}
.tl-drawer {
  width: 100%;
  max-width: 26rem;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}
.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.125rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: #ffffff;
}
.tl-header-left { display: flex; align-items: center; gap: 0.75rem; }
.tl-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
}
.tl-title { font-size: 0.9375rem; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; }
.tl-subtitle { font-size: 0.75rem; color: #64748b; margin: 0.15rem 0 0; }
.tl-code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  background: #f1f5f9;
  padding: 0.1rem 0.375rem;
  border-radius: 0.2rem;
  color: #1d4ed8;
}
.tl-close {
  width: 2rem; height: 2rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.tl-close:hover { background: #f1f5f9; color: #0f172a; }
.tl-close:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.tl-body { flex: 1; overflow-y: auto; padding: 1.25rem; background: #f8fafc; }

/* Loading skeleton */
.tl-loading { display: flex; flex-direction: column; gap: 1.25rem; }
.tl-skel-row { display: flex; gap: 1rem; align-items: flex-start; }
.tl-skel-dot {
  width: 0.875rem; height: 0.875rem;
  border-radius: 50%;
  background: #e2e8f0;
  flex-shrink: 0;
  margin-top: 0.25rem;
  animation: shimmer 1.4s infinite;
}
.tl-skel-content { flex: 1; display: flex; flex-direction: column; gap: 0.375rem; }
.tl-skel {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
  height: 0.875rem;
}
.tl-skel--title { width: 60%; height: 1rem; }
.tl-skel--sub   { width: 85%; height: 0.75rem; }

/* Empty */
.tl-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 3rem 1.5rem; gap: 0.5rem; }
.tl-empty-icon  { color: #cbd5e1; margin-bottom: 0.25rem; }
.tl-empty-title { font-size: 0.9375rem; font-weight: 700; color: #334155; }
.tl-empty-sub   { font-size: 0.8125rem; color: #94a3b8; line-height: 1.5; max-width: 18rem; }

/* Timeline list */
.tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 0.875rem; position: relative; align-items: flex-start; }

/* Conector e dot */
.tl-connector {
  position: absolute;
  left: 0.375rem;
  top: 1.125rem;
  width: 2px;
  bottom: 0;
  background: #e2e8f0;
  transform: translateX(-50%);
  z-index: 0;
}
.tl-connector--hidden { background: transparent; }

.tl-dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 0 0 1.5px currentColor;
  flex-shrink: 0;
  margin-top: 0.3125rem;
  z-index: 1;
  position: relative;
}
.rdot--green  { background: #16a34a; color: #16a34a; }
.rdot--amber  { background: #d97706; color: #d97706; }
.rdot--red    { background: #dc2626; color: #dc2626; }
.rdot--orange { background: #ea580c; color: #ea580c; }
.rdot--slate  { background: #64748b; color: #64748b; }

/* Card */
.tl-card {
  flex: 1;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
  margin-bottom: 1.125rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tl-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.tl-setor-wrap { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.tl-setor-icon { color: #64748b; flex-shrink: 0; }
.tl-setor-nome { font-size: 0.875rem; font-weight: 800; color: #0f172a; }
.tl-tipo-setor {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 0.05rem 0.375rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tl-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; }
.rstat--green  { background: #dcfce7; color: #15803d; }
.rstat--amber  { background: #fef3c7; color: #92400e; }
.rstat--red    { background: #fee2e2; color: #b91c1c; }
.rstat--orange { background: #ffedd5; color: #c2410c; }
.rstat--slate  { background: #f1f5f9; color: #475569; }

.tl-lote-tag { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: #64748b; }

.tl-dates {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
}
.tl-date-row { display: flex; align-items: center; gap: 0.375rem; }
.tl-date-icon  { color: #94a3b8; flex-shrink: 0; }
.tl-date-label { font-size: 0.75rem; font-weight: 600; color: #64748b; min-width: 4rem; }
.tl-date-val   { font-size: 0.8125rem; color: #0f172a; font-weight: 500; }

.tl-permanencia { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; }
.tl-perm-icon  { color: #64748b; flex-shrink: 0; }
.tl-perm-label { font-weight: 600; color: #64748b; }
.tl-perm-val   { font-weight: 800; color: #1d4ed8; }

.tl-operadores { display: flex; flex-direction: column; gap: 0.25rem; border-top: 1px solid #f1f5f9; padding-top: 0.5rem; }
.tl-op { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; }
.tl-op-tag {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.05rem 0.35rem;
  border-radius: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.tl-op-nome { color: #334155; font-weight: 500; }

.tl-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: #ffffff;
}
.tl-footer-info { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: #94a3b8; font-weight: 500; }

/* Drawer slide-in */
.drawer-enter-active { transition: opacity 0.2s ease; }
.drawer-leave-active { transition: opacity 0.25s ease; }
.drawer-enter-active .tl-drawer { transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.drawer-leave-active .tl-drawer { transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.drawer-enter-from            { opacity: 0; }
.drawer-enter-from .tl-drawer { transform: translateX(100%); }
.drawer-leave-to              { opacity: 0; }
.drawer-leave-to .tl-drawer   { transform: translateX(100%); }

/* ─── Botão de Impressão e Layouts Extras ─────────────────── */
.actions-flex {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-action-print {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-family: inherit;
  font-weight: 700;
  color: #475569;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-action-print:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #0f172a;
}

.model-info-cell {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  text-align: left;
}
.model-name-text {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #0f172a;
}
.model-ref-sub {
  font-size: 0.6875rem;
  color: #64748b;
  font-weight: 500;
}
</style>
