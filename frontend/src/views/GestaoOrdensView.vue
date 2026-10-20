<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  Package,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Activity,
  Printer,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'
import { configStore } from '../api/config.store'
import { formatDate } from '../utils/date'
import OrderCreateModal from '../components/ordens/OrderCreateModal.vue'
import OrderPrintModal from '../components/ordens/OrderPrintModal.vue'
import OrderHistoryModal from '../components/ordens/OrderHistoryModal.vue'
import OrderMaintenanceModal from '../components/ordens/OrderMaintenanceModal.vue'
import type { OrdemTeste, Modelo, Planta } from '../components/ordens/types'

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

// ─── Estado Reativo ────────────────────────────────────────────
const router = useRouter()
const ordens = ref<OrdemTeste[]>([])
const modelos = computed<Modelo[]>(() => (configStore.modelos.value || []) as Modelo[])
const plantas = computed<Planta[]>(() => (configStore.plantas.value || []) as Planta[])

const loading = ref(true)
const searchQuery = ref('')
const toasts = ref<Toast[]>([])

// ─── Permissões ────────────────────────────────────────────────
const canEditOrdens = computed(() => authStore.hasPermission('EDITAR_TELA_GESTAO_ORDENS'))
const canConfigureOrdem = computed(() =>
  canEditOrdens.value && authStore.hasPermission('CONFIGURAR_ORDEM_TESTE')
)
const canEditSla = computed(() => canConfigureOrdem.value && authStore.hasPermission('EDITAR_ROTA'))
const canViewRastreamento = computed(() => authStore.hasPermission('TELA_RASTREAMENTO'))
const canCreateOrdem = computed(() =>
  authStore.hasPermission('TELA_NOVA_ORDEM_TESTE') && authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE')
)
const canPrintOrdens = computed(() =>
  authStore.hasPermission('EDITAR_TELA_GESTAO_ORDENS') ||
  authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE') ||
  authStore.hasPermission('EDITAR_TELA_BIPAGEM')
)

// ─── Resolução de Nomes do Catálogo via Cache ──────────────────
function getModeloNome(modeloId: string) {
  return configStore.getModeloNome(modeloId)
}

function getModeloReferencia(modeloId: string) {
  return configStore.getModeloReferencia(modeloId)
}

let toastCounter = 0

// ─── Modais Desacoplados ───────────────────────────────────────
const showModal = ref(false)
const showTicketsSetorModal = ref(false)
const ticketsSetorOrdem = ref<OrdemTeste | null>(null)
const ticketsSetorModeloNome = computed(() =>
  ticketsSetorOrdem.value ? (ticketsSetorOrdem.value.modelo?.nome || getModeloNome(ticketsSetorOrdem.value.modeloId)) : ''
)

const showAcompanharModal = ref(false)
const acompanharOrdem = ref<OrdemTeste | null>(null)

const showManutencaoModal = ref(false)
const manutencaoOrdem = ref<OrdemTeste | null>(null)

function openModal() {
  showModal.value = true
}

function abrirTicketsSetor(ordem: OrdemTeste) {
  ticketsSetorOrdem.value = ordem
  showTicketsSetorModal.value = true
}

function abrirAcompanhamento(ordem: OrdemTeste) {
  acompanharOrdem.value = ordem
  showAcompanharModal.value = true
}

function abrirRastreamentoDaOrdem(ordem: OrdemTeste) {
  void router.push({ name: 'rastreamento-ordem', params: { ordemTesteId: ordem.id } })
}

function abrirManutencao(ordem: OrdemTeste) {
  manutencaoOrdem.value = ordem
  showManutencaoModal.value = true
}

// ─── Paginação e Busca ──────────────────────────────────────────
const currentPage = ref(1)
const pageSize = ref(15)
const totalItems = ref(0)
const totalPages = ref(1)
let searchDebounceTimeout: any = null

async function onOrdemCreated() {
  currentPage.value = 1
  await Promise.all([fetchOrdens(), fetchDropdownData()])
}

function onManutencaoSaved(loteAtualizado: any) {
  const idx = ordens.value.findIndex(o => o.id === loteAtualizado.id)
  if (idx !== -1) {
    ordens.value[idx] = { ...ordens.value[idx], ...loteAtualizado }
  }
}

// ─── Helpers de Status ─────────────────────────────────────────
const statusConfig: Record<string, { label: string; cls: string }> = {
  AGUARDANDO_MODELAGEM:      { label: 'Aguardando Modelagem',   cls: 'badge--orange' },
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

// ─── Computed ──────────────────────────────────────────────────
const stats = computed(() => ({
  total: totalItems.value,
  emAndamento: ordens.value.filter(
    (o) => !['APROVADO', 'REPROVADO', 'LIBERADO_PRODUCAO'].includes(o.status)
  ).length,
  aprovados: ordens.value.filter((o) => o.status === 'APROVADO' || o.status === 'LIBERADO_PRODUCAO').length,
  alta: ordens.value.filter((o) => o.prioridadePcp === 'ALTA').length,
}))

// ─── Controles de Busca e Paginação ────────────────────────────
function onSearchInput() {
  clearTimeout(searchDebounceTimeout)
  searchDebounceTimeout = setTimeout(() => {
    currentPage.value = 1
    void fetchOrdens()
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  currentPage.value = 1
  void fetchOrdens()
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === currentPage.value) return
  currentPage.value = p
  void fetchOrdens()
}

function onPageSizeChange(e: Event) {
  const target = e.target as HTMLSelectElement
  pageSize.value = Number(target.value) || 15
  currentPage.value = 1
  void fetchOrdens()
}

// ─── Toast ─────────────────────────────────────────────────────
function addToast(type: 'success' | 'error', message: string) {
  const id = ++toastCounter
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

// ─── Requisições ───────────────────────────────────────────────
async function fetchOrdens() {
  loading.value = true
  try {
    const q = searchQuery.value.trim()
    const { data, headers } = await api.get('/lotes', {
      params: {
        page: currentPage.value,
        limit: pageSize.value,
        ...(q ? { q } : {})
      }
    })

    if (data && typeof data === 'object' && Array.isArray((data as any).data)) {
      ordens.value = (data as any).data
      totalItems.value = (data as any).total || 0
      totalPages.value = (data as any).totalPages || 1
      currentPage.value = (data as any).page || 1
    } else {
      ordens.value = Array.isArray(data) ? (data as OrdemTeste[]) : []
      const headerTotal = headers['x-total-count']
      totalItems.value = headerTotal ? Number(headerTotal) : ordens.value.length
      totalPages.value = Math.max(1, Math.ceil(totalItems.value / pageSize.value))
    }
  } catch {
    addToast('error', 'Erro ao carregar ordens de produção.')
  } finally {
    loading.value = false
  }
}

async function fetchDropdownData() {
  try {
    await Promise.all([
      configStore.getModelos(),
      configStore.getPlantas(),
      configStore.getCatalogoModelos(),
    ])
  } catch {
    addToast('error', 'Erro ao carregar opções do formulário.')
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────
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
          v-if="canCreateOrdem"
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
          @input="onSearchInput"
          type="search"
          class="search-input"
          placeholder="Buscar por código de barras ou modelo..."
          aria-label="Buscar ordens"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="btn-clear-search"
          @click="clearSearch"
          aria-label="Limpar busca"
        >
          <X :size="14" />
        </button>
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
      <div v-else-if="ordens.length === 0" class="table-empty">
        <Package :size="40" class="empty-icon" aria-hidden="true" />
        <p class="empty-title">Nenhuma ordem encontrada</p>
        <p class="empty-sub">
          {{ searchQuery ? 'Nenhum resultado para a pesquisa informada.' : 'Crie a primeira ordem de teste clicando em "Nova Ordem de Teste".' }}
        </p>
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
            <tr v-for="ordem in ordens" :key="ordem.id" class="go-row">
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
                    v-if="canPrintOrdens"
                    type="button"
                    class="btn-action-print"
                    @click="abrirTicketsSetor(ordem)"
                    :aria-label="`Abrir etiquetas da ordem ${ordem.codigoBarras}`"
                    title="Etiquetas do lote e dos setores"
                  >
                    <Printer :size="14" aria-hidden="true" />
                    <span>Etiquetas</span>
                  </button>
                  <button
                    type="button"
                    class="btn-action-timeline"
                    @click="abrirAcompanhamento(ordem)"
                    :aria-label="`Abrir opções de acompanhamento da ordem ${ordem.codigoBarras}`"
                    title="Acompanhar ordem"
                  >
                    <Activity :size="14" aria-hidden="true" />
                    <span>Acompanhar</span>
                  </button>
                  <button
                    v-if="canConfigureOrdem"
                    type="button"
                    class="btn-action-timeline"
                    style="background: #f1f5f9; color: #334155; border-color: #cbd5e1; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid #cbd5e1;"
                    @click="abrirManutencao(ordem)"
                    title="Configuração da Ordem (SLAs e Remanejamento)"
                  >
                    <Settings :size="14" aria-hidden="true" />
                    <span>Configuração</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rodapé com Paginação -->
      <div v-if="!loading && ordens.length > 0" class="table-footer-pagination">
        <div class="pagination-info">
          <span>Mostrando {{ ((currentPage - 1) * pageSize) + 1 }}–{{ Math.min(currentPage * pageSize, totalItems) }} de {{ totalItems }} ordem{{ totalItems !== 1 ? 's' : '' }}</span>
          <div class="page-size-selector">
            <label for="sel-page-size-ordens">Exibir:</label>
            <select id="sel-page-size-ordens" :value="pageSize" @change="onPageSizeChange">
              <option :value="15">15</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        <div class="pagination-controls">
          <button
            type="button"
            class="pagination-btn"
            :disabled="currentPage <= 1 || loading"
            @click="goToPage(currentPage - 1)"
            aria-label="Página anterior"
          >
            <ChevronLeft :size="15" />
            <span>Anterior</span>
          </button>
          <span class="pagination-pages">
            Página {{ currentPage }} de {{ totalPages }}
          </span>
          <button
            type="button"
            class="pagination-btn"
            :disabled="currentPage >= totalPages || loading"
            @click="goToPage(currentPage + 1)"
            aria-label="Próxima página"
          >
            <span>Próxima</span>
            <ChevronRight :size="15" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modais Desacoplados ──────────────────────────────── -->
    <OrderCreateModal
      v-model="showModal"
      :modelos="modelos"
      :plantas="plantas"
      @created="onOrdemCreated"
      @success="msg => addToast('success', msg)"
      @error="msg => addToast('error', msg)"
    />

    <OrderPrintModal
      v-model="showTicketsSetorModal"
      :ordem="ticketsSetorOrdem"
      :can-print="canPrintOrdens"
      :modelo-nome="ticketsSetorModeloNome"
      @error="msg => addToast('error', msg)"
    />

    <OrderHistoryModal
      v-model="showAcompanharModal"
      :ordem="acompanharOrdem"
      :can-view-rastreamento="canViewRastreamento"
      :modelo-nome="ticketsSetorModeloNome"
      @open-rastreamento="abrirRastreamentoDaOrdem"
      @error="msg => addToast('error', msg)"
    />

    <OrderMaintenanceModal
      v-model="showManutencaoModal"
      :ordem="manutencaoOrdem"
      :can-configure-ordem="canConfigureOrdem"
      :can-edit-sla="canEditSla"
      :ordens="ordens"
      @saved="onManutencaoSaved"
      @success="msg => addToast('success', msg)"
      @error="msg => addToast('error', msg)"
    />

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
  padding: 0.5625rem 2rem 0.5625rem 2.25rem;
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

.btn-clear-search {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
}
.btn-clear-search:hover {
  color: #0f172a;
  background: #f1f5f9;
}

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

/* Table footer com paginação */
.table-footer-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 0.8125rem;
  color: #64748b;
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.page-size-selector select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.8125rem;
  outline: none;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pagination-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #334155;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.pagination-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-pages {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
  padding: 0 0.5rem;
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
