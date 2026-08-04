<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  Layers,
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
  Tag,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Scissors,
  Trash2
} from '@lucide/vue'
import api from '../api/axios'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Marca {
  id: string
  nome: string
}

interface PecaInfo {
  id: string
  nome: string
  setorCorteOpcaoId?: string
}

interface Modelo {
  id: string
  nome: string
  codigoProduto: string
  temporada: string | null
  dataCorte: string | null
  status: string
  ativo: boolean
  marca: Marca | null
  marcaId: string
  pecas?: PecaInfo[]
  createdAt: string
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface CatalogoItem {
  id: string
  numero: string
  nome: string
  codigoOriginal: string | null
}

interface MaquinaOpcao {
  id: string
  label: string
  valor: string
}

interface PecaSelecionada {
  id: string
  numero: string
  nome: string
  codigoOriginal: string | null
  setorCorteOpcaoId: string
}

// ─── Estado ──────────────────────────────────────────────────────────────────
const modelos = ref<Modelo[]>([])
const marcas  = ref<Marca[]>([])

const loading       = ref(true)
const loadingCreate = ref(false)
const showModal     = ref(false)
const modalStep     = ref(1) // 1: Modelo, 2: Peças
const searchQuery   = ref('')
const toasts        = ref<Toast[]>([])
let toastCounter    = 0

// ─── Formulário do Modelo ───────────────────────────────────────────────────
const form = ref({
  marcaId:       '',
  codigoProduto: '',
  nome:          '',
  temporada:     '',
  dataCorte:     '',
})
const formErrors = ref<Record<string, string>>({})

// ─── Peças do Modelo (Passo 2) ───────────────────────────────────────────────
const pecasSelecionadas = ref<PecaSelecionada[]>([])
const catalogoPecas = ref<CatalogoItem[]>([])
const maquinasCorte = ref<MaquinaOpcao[]>([])
const searchPecaText = ref('')
const showAutocomplete = ref(false)
const autocompleteRef = ref<HTMLElement | null>(null)

function handleClickOutside(e: MouseEvent) {
  if (autocompleteRef.value && !autocompleteRef.value.contains(e.target as Node)) {
    showAutocomplete.value = false
  }
}

// ─── Config de Status ────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; cls: string }> = {
  CADASTRADO:    { label: 'Cadastrado',    cls: 'badge--slate' },
  EM_TESTE:      { label: 'Em Teste',      cls: 'badge--blue'  },
  LIBERADO:      { label: 'Liberado',      cls: 'badge--green' },
  NAO_LIBERADO:  { label: 'Não Liberado', cls: 'badge--red'   },
}

function getStatusBadge(s: string) {
  return statusConfig[s] ?? { label: s, cls: 'badge--slate' }
}

// ─── Computed ────────────────────────────────────────────────────────────────
const filteredModelos = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return modelos.value
  return modelos.value.filter(
    (m) =>
      m.nome.toLowerCase().includes(q) ||
      m.codigoProduto.toLowerCase().includes(q) ||
      (m.marca?.nome ?? '').toLowerCase().includes(q) ||
      (m.temporada ?? '').toLowerCase().includes(q)
  )
})

const stats = computed(() => ({
  total:       modelos.value.length,
  emTeste:     modelos.value.filter((m) => m.status === 'EM_TESTE').length,
  liberados:   modelos.value.filter((m) => m.status === 'LIBERADO').length,
  cadastrados: modelos.value.filter((m) => m.status === 'CADASTRADO').length,
}))

const filteredCatalogo = computed(() => {
  const q = searchPecaText.value.trim().toLowerCase()
  if (!q) return catalogoPecas.value.slice(0, 12)
  return catalogoPecas.value.filter(item =>
    item.numero.toLowerCase().includes(q) ||
    item.nome.toLowerCase().includes(q) ||
    (item.codigoOriginal && item.codigoOriginal.toLowerCase().includes(q))
  ).slice(0, 15)
})

// ─── Toast ───────────────────────────────────────────────────────────────────
function addToast(type: 'success' | 'error', message: string) {
  const id = ++toastCounter
  toasts.value.push({ id, type, message })
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, 4500)
}

// ─── Requisicoes ─────────────────────────────────────────────────────────────
async function fetchModelos() {
  loading.value = true
  try {
    const { data } = await api.get<Modelo[]>('/admin/modelos/catalogo')
    modelos.value = data
  } catch {
    addToast('error', 'Erro ao carregar catálogo de modelos.')
  } finally {
    loading.value = false
  }
}

async function fetchMarcas() {
  try {
    const { data } = await api.get<Marca[]>('/admin/marcas')
    marcas.value = data
  } catch {
    addToast('error', 'Erro ao carregar marcas.')
  }
}

async function fetchStep2Options() {
  try {
    const [catRes, maqRes] = await Promise.all([
      api.get<CatalogoItem[]>('/catalogo-pecas'),
      api.get<any[]>('/config/opcoes/subsetor_corte').catch(() =>
        api.get<any[]>('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } })
      )
    ])
    catalogoPecas.value = catRes.data || []
    maquinasCorte.value = (maqRes.data || []).map((m: any) => ({
      id: m.id,
      label: m.label || m.valor,
      valor: m.valor
    }))
  } catch (err) {
    console.error('[GestaoModelosView] Erro ao buscar catálogo/máquinas:', err)
  }
}

function advanceToStep2() {
  formErrors.value = {}

  if (!form.value.marcaId.trim())       formErrors.value.marcaId = 'Selecione uma marca.'
  if (!form.value.codigoProduto.trim()) formErrors.value.codigoProduto = 'Código do produto é obrigatório.'
  if (!form.value.nome.trim())          formErrors.value.nome = 'Nome do modelo é obrigatório.'

  if (Object.keys(formErrors.value).length > 0) return
  modalStep.value = 2
}

function addPecaFromCatalogo(item: CatalogoItem) {
  const jaExiste = pecasSelecionadas.value.some(p => p.id === item.id)
  if (jaExiste) {
    addToast('error', `A peça ${item.numero} - ${item.nome} já foi adicionada.`)
    return
  }

  const defaultMaquinaId = maquinasCorte.value[0]?.id || ''

  pecasSelecionadas.value.push({
    id: item.id,
    numero: item.numero,
    nome: item.nome,
    codigoOriginal: item.codigoOriginal,
    setorCorteOpcaoId: defaultMaquinaId
  })

  searchPecaText.value = ''
  showAutocomplete.value = false
}

function removePeca(index: number) {
  pecasSelecionadas.value.splice(index, 1)
}

async function handleCreateModelo() {
  formErrors.value = {}

  if (!form.value.marcaId.trim())       formErrors.value.marcaId = 'Selecione uma marca.'
  if (!form.value.codigoProduto.trim()) formErrors.value.codigoProduto = 'Código do produto é obrigatório.'
  if (!form.value.nome.trim())          formErrors.value.nome = 'Nome do modelo é obrigatório.'

  if (Object.keys(formErrors.value).length > 0) {
    modalStep.value = 1
    return
  }

  loadingCreate.value = true
  try {
    await api.post('/admin/modelos', {
      marcaId:       form.value.marcaId,
      codigoProduto: form.value.codigoProduto.trim(),
      nome:          form.value.nome.trim(),
      temporada:     form.value.temporada.trim() || null,
      dataCorte:     form.value.dataCorte ? form.value.dataCorte : null,
      pecas:         pecasSelecionadas.value
    })
    addToast('success', `Modelo "${form.value.nome}" cadastrado com sucesso.`)
    await fetchModelos()
    closeModal()
  } catch (err: any) {
    const code      = err?.response?.data?.code
    const serverMsg = err?.response?.data?.error

    if (code === 'MODELO_DUPLICATE_CODE') {
      modalStep.value = 1
      formErrors.value.codigoProduto = 'Este código de produto já está em uso.'
    } else {
      addToast('error', typeof serverMsg === 'string' ? serverMsg : 'Erro ao cadastrar modelo.')
    }
  } finally {
    loadingCreate.value = false
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal() {
  modalStep.value = 1
  form.value = { marcaId: '', codigoProduto: '', nome: '', temporada: '', dataCorte: '' }
  pecasSelecionadas.value = []
  formErrors.value = {}
  showModal.value = true
  fetchStep2Options()
}

function closeModal() {
  showModal.value = false
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await Promise.all([fetchModelos(), fetchMarcas()])
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="gm-root">

    <!-- Toast Stack -->
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

    <!-- Page Header -->
    <header class="gm-header">
      <div class="gm-header-left">
        <div class="page-icon-wrap" aria-hidden="true">
          <Layers :size="20" />
        </div>
        <div>
          <h1 class="gm-title">Catálogo de Modelos</h1>
          <p class="gm-subtitle">Cadastre e gerencie os modelos de calçado que serão submetidos a testes de produção.</p>
        </div>
      </div>
      <div class="gm-header-actions">
        <button
          id="btn-refresh-modelos"
          type="button"
          class="btn-ghost"
          :disabled="loading"
          @click="fetchModelos"
          aria-label="Recarregar modelos"
        >
          <RefreshCw :size="15" :class="{ 'spin-anim': loading }" aria-hidden="true" />
        </button>
        <button
          id="btn-novo-modelo"
          type="button"
          class="btn-primary"
          @click="openModal"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>Novo Modelo</span>
        </button>
      </div>
    </header>

    <!-- KPI Strip -->
    <section class="kpi-strip" aria-label="Estatísticas do catálogo">
      <div class="kpi-card">
        <Layers :size="18" class="kpi-icon" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.total }}</span>
          <span class="kpi-lbl">Total</span>
        </div>
      </div>
      <div class="kpi-card">
        <RefreshCw :size="18" class="kpi-icon kpi-icon--blue" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.emTeste }}</span>
          <span class="kpi-lbl">Em Teste</span>
        </div>
      </div>
      <div class="kpi-card">
        <CheckCircle2 :size="18" class="kpi-icon kpi-icon--green" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.liberados }}</span>
          <span class="kpi-lbl">Liberados</span>
        </div>
      </div>
      <div class="kpi-card">
        <Tag :size="18" class="kpi-icon kpi-icon--slate" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.cadastrados }}</span>
          <span class="kpi-lbl">Cadastrados</span>
        </div>
      </div>
    </section>

    <!-- Toolbar -->
    <div class="gm-toolbar">
      <div class="search-wrap">
        <Search :size="15" class="search-icon" aria-hidden="true" />
        <input
          id="input-search-modelos"
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Buscar por nome, código, marca ou temporada..."
          aria-label="Buscar modelos"
        />
      </div>
    </div>

    <!-- Table Card -->
    <div class="table-card">
      <!-- Loading -->
      <div v-if="loading" class="table-loading" aria-label="Carregando modelos...">
        <div v-for="i in 6" :key="i" class="skeleton-row">
          <div class="skel skel--code"></div>
          <div class="skel skel--long"></div>
          <div class="skel skel--mid"></div>
          <div class="skel skel--short"></div>
          <div class="skel skel--short"></div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredModelos.length === 0" class="table-empty">
        <Package :size="40" class="empty-icon" aria-hidden="true" />
        <p class="empty-title">Nenhum modelo encontrado</p>
        <p class="empty-sub">Cadastre o primeiro modelo clicando em "Novo Modelo".</p>
      </div>

      <!-- Data table -->
      <div v-else class="table-outer" role="region" aria-label="Tabela de modelos de calçado">
        <table class="gm-table">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Nome do Modelo</th>
              <th scope="col">Marca</th>
              <th scope="col" class="text-center">Temporada</th>
              <th scope="col" class="text-center">Data de Corte</th>
              <th scope="col" class="text-center">Peças</th>
              <th scope="col" class="text-center">Status</th>
              <th scope="col">Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="modelo in filteredModelos" :key="modelo.id" class="gm-row">
              <td>
                <span class="code-cell">{{ modelo.codigoProduto }}</span>
              </td>
              <td>
                <span class="nome-cell">{{ modelo.nome }}</span>
              </td>
              <td>
                <span class="marca-cell">{{ modelo.marca?.nome ?? '—' }}</span>
              </td>
              <td class="text-center">
                <span v-if="modelo.temporada" class="temporada-pill">
                  <Calendar :size="11" aria-hidden="true" />
                  {{ modelo.temporada }}
                </span>
                <span v-else class="empty-dash">—</span>
              </td>
              <td class="text-center">
                <span v-if="modelo.dataCorte" class="date-pill">
                  <Calendar :size="11" aria-hidden="true" />
                  {{ formatDate(modelo.dataCorte) }}
                </span>
                <span v-else class="empty-dash">—</span>
              </td>
              <td class="text-center">
                <span v-if="modelo.pecas && modelo.pecas.length > 0" class="pecas-pill">
                  {{ modelo.pecas.length }} peça{{ modelo.pecas.length !== 1 ? 's' : '' }}
                </span>
                <span v-else class="empty-dash">—</span>
              </td>
              <td class="text-center">
                <span class="badge" :class="getStatusBadge(modelo.status).cls">
                  {{ getStatusBadge(modelo.status).label }}
                </span>
              </td>
              <td class="date-cell">{{ formatDate(modelo.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div v-if="!loading && filteredModelos.length > 0" class="table-footer">
        <span>{{ filteredModelos.length }} modelo{{ filteredModelos.length !== 1 ? 's' : '' }} no catálogo</span>
      </div>
    </div>

    <!-- Modal — Wizard de Cadastro de Modelo (2 Passos) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-modelos"
          @click.self="closeModal"
        >
          <div class="modal-panel modal-panel--wide">
            <!-- Header com Indicador de Passos -->
            <div class="modal-header">
              <div class="modal-header-left">
                <div class="modal-icon-wrap" aria-hidden="true">
                  <Layers :size="18" />
                </div>
                <div>
                  <h2 id="modal-title-modelos" class="modal-title">Novo Modelo de Calçado</h2>
                  <div class="modal-step-badge">
                    <span>Passo {{ modalStep }} de 2</span> — {{ modalStep === 1 ? 'Dados Gerais' : 'Vinculação de Peças' }}
                  </div>
                </div>
              </div>
              <button
                id="btn-close-modal-modelos"
                type="button"
                class="modal-close"
                @click="closeModal"
                aria-label="Fechar modal"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <!-- Body PASSO 1: Dados do Modelo -->
            <div v-if="modalStep === 1" class="modal-body">
              <p class="modal-description">
                Passo 1: Informe a marca, código, nome, temporada e a previsão da data de corte do modelo.
              </p>

              <!-- Marca -->
              <div class="form-field">
                <label for="sel-marca" class="form-label">
                  Marca <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-marca"
                    v-model="form.marcaId"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.marcaId }"
                  >
                    <option value="" disabled>Selecione uma marca...</option>
                    <option v-for="m in marcas" :key="m.id" :value="m.id">{{ m.nome }}</option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.marcaId" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.marcaId }}
                </span>
              </div>

              <div class="form-row-2">
                <!-- Código do Produto -->
                <div class="form-field">
                  <label for="inp-codigo" class="form-label">
                    Código do Produto <span class="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inp-codigo"
                    v-model="form.codigoProduto"
                    type="text"
                    class="form-input"
                    :class="{ 'form-input--error': formErrors.codigoProduto }"
                    placeholder="Ex: 502698"
                    maxlength="50"
                  />
                  <span v-if="formErrors.codigoProduto" class="form-error" role="alert">
                    <AlertCircle :size="12" aria-hidden="true" />
                    {{ formErrors.codigoProduto }}
                  </span>
                </div>

                <!-- Temporada -->
                <div class="form-field">
                  <label for="inp-temporada" class="form-label">
                    Temporada <span class="optional-tag">opcional</span>
                  </label>
                  <input
                    id="inp-temporada"
                    v-model="form.temporada"
                    type="text"
                    class="form-input"
                    placeholder="Ex: SS26"
                    maxlength="50"
                  />
                </div>
              </div>

              <!-- Nome do Modelo -->
              <div class="form-field">
                <label for="inp-nome" class="form-label">
                  Nome do Modelo <span class="required-star" aria-hidden="true">*</span>
                </label>
                <input
                  id="inp-nome"
                  v-model="form.nome"
                  type="text"
                  class="form-input"
                  :class="{ 'form-input--error': formErrors.nome }"
                  placeholder="Ex: AIR MAX EXCELLENCE"
                  maxlength="150"
                />
                <span v-if="formErrors.nome" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.nome }}
                </span>
              </div>

              <!-- Data de Corte (Previsão) -->
              <div class="form-field">
                <label for="inp-datacorte" class="form-label">
                  Data de Corte (Previsão) <span class="optional-tag">opcional</span>
                </label>
                <input
                  id="inp-datacorte"
                  v-model="form.dataCorte"
                  type="date"
                  class="form-input"
                />
                <span class="field-hint">Previsão da data de corte para programação da OP.</span>
              </div>
            </div>

            <!-- Body PASSO 2: Vinculação de Peças -->
            <div v-else-if="modalStep === 2" class="modal-body">
              <p class="modal-description">
                Passo 2: Adicione as peças técnicas do catálogo a este modelo e selecione a máquina de corte.
              </p>

              <!-- Autocomplete do Catálogo -->
              <div class="pecas-ac-container" ref="autocompleteRef">
                <label class="form-label">Pesquisar Peça no Catálogo Global</label>
                <div class="ac-input-wrap">
                  <Search :size="15" class="ac-icon" />
                  <input
                    type="text"
                    v-model="searchPecaText"
                    @focus="showAutocomplete = true"
                    placeholder="Buscar por número (ex: 026) ou nome (ex: GÁSPEA)..."
                    class="ac-input"
                  />
                </div>

                <!-- Dropdown de resultados -->
                <div v-if="showAutocomplete && filteredCatalogo.length > 0" class="ac-dropdown">
                  <div
                    v-for="item in filteredCatalogo"
                    :key="item.id"
                    class="ac-item"
                    @mousedown.prevent="addPecaFromCatalogo(item)"
                  >
                    <span class="ac-badge">{{ item.numero }}</span>
                    <span class="ac-name">{{ item.nome }}</span>
                    <span v-if="item.codigoOriginal" class="ac-ref">Ref: {{ item.codigoOriginal }}</span>
                  </div>
                </div>
              </div>

              <!-- Lista de Peças Selecionadas -->
              <div class="pecas-list-block">
                <div class="pecas-list-title">Peças Atribuídas ao Modelo ({{ pecasSelecionadas.length }})</div>
                
                <div v-if="pecasSelecionadas.length === 0" class="pecas-empty">
                  <Scissors :size="28" class="text-slate-400" />
                  <span>Nenhuma peça vinculada ainda. Utilize o campo de busca acima.</span>
                </div>

                <div v-else class="pecas-table-wrap">
                  <table class="pecas-table">
                    <thead>
                      <tr>
                        <th style="width: 70px; text-align: center;">Nº</th>
                        <th>Nome da Peça</th>
                        <th>Máquina de Corte</th>
                        <th style="width: 50px; text-align: center;">Remover</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(p, idx) in pecasSelecionadas" :key="p.id" class="peca-row">
                        <td style="text-align: center;">
                          <span class="peca-badge">{{ p.numero }}</span>
                        </td>
                        <td>
                          <strong>{{ p.nome }}</strong>
                        </td>
                        <td>
                          <select v-model="p.setorCorteOpcaoId" class="maquina-select">
                            <option v-for="m in maquinasCorte" :key="m.id" :value="m.id">
                              {{ m.label }}
                            </option>
                          </select>
                        </td>
                        <td style="text-align: center;">
                          <button
                            type="button"
                            class="btn-del-peca"
                            @click="removePeca(idx)"
                            title="Remover peça"
                          >
                            <Trash2 :size="14" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Footer com Ações de Navegação -->
            <div class="modal-footer">
              <button
                v-if="modalStep === 1"
                id="btn-cancel-modelo"
                type="button"
                class="btn-outline"
                @click="closeModal"
                :disabled="loadingCreate"
              >
                Cancelar
              </button>
              <button
                v-if="modalStep === 2"
                type="button"
                class="btn-outline"
                @click="modalStep = 1"
                :disabled="loadingCreate"
              >
                <ArrowLeft :size="15" aria-hidden="true" />
                <span>Voltar aos Dados</span>
              </button>

              <button
                v-if="modalStep === 1"
                type="button"
                class="btn-primary"
                @click="advanceToStep2"
              >
                <span>Avançar para Peças</span>
                <ArrowRight :size="15" aria-hidden="true" />
              </button>
              <button
                v-if="modalStep === 2"
                id="btn-confirm-modelo"
                type="button"
                class="btn-primary"
                @click="handleCreateModelo"
                :disabled="loadingCreate"
              >
                <Loader2 v-if="loadingCreate" :size="15" class="spin-anim" aria-hidden="true" />
                <Plus v-else :size="15" aria-hidden="true" />
                <span>{{ loadingCreate ? 'Cadastrando...' : 'Salvar Modelo' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════
   DESIGN SYSTEM — CATALOGO DE MODELOS (MONOCROMÁTICO)
   Estética: Industrial Utilitarian · Monochrome
   Paleta: slate-50 base · slate-900 texto · zinc accents
══════════════════════════════════════════════════════ */

.gm-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 100%;
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}

/* ─── Header ───────────────────────────────────────── */
.gm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.gm-header-left {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}
.page-icon-wrap {
  width: 2.5rem;
  height: 2.5rem;
  background: #0f172a;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.gm-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.025em;
  line-height: 1.2;
  margin: 0;
}
.gm-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.25rem 0 0;
  line-height: 1.5;
}
.gm-header-actions {
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
.btn-primary:focus-visible { outline: 2px solid #0f172a; outline-offset: 2px; }

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
.kpi-icon         { color: #475569; flex-shrink: 0; }
.kpi-icon--blue   { color: #0f172a; }
.kpi-icon--green  { color: #0f172a; }
.kpi-icon--slate  { color: #64748b; }
.kpi-data  { display: flex; flex-direction: column; }
.kpi-val   { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1; }
.kpi-lbl   { font-size: 0.75rem; font-weight: 500; color: #64748b; margin-top: 0.2rem; text-transform: uppercase; letter-spacing: 0.04em; }

/* ─── Toolbar ──────────────────────────────────────── */
.gm-toolbar { display: flex; align-items: center; gap: 0.75rem; }
.search-wrap { position: relative; flex: 1; max-width: 28rem; }
.search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
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
.search-input:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.1); }
.search-input::placeholder { color: #94a3b8; }

/* ─── Table Card ───────────────────────────────────── */
.table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

/* Skeleton */
.table-loading { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.625rem; }
.skeleton-row  { display: flex; gap: 1rem; align-items: center; }
.skel {
  height: 1rem;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
}
.skel--code  { width: 6rem; }
.skel--long  { width: 12rem; }
.skel--mid   { width: 8rem; }
.skel--short { width: 5rem; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Empty */
.table-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 3.5rem 2rem; text-align: center; }
.empty-icon  { color: #cbd5e1; margin-bottom: 0.25rem; }
.empty-title { font-size: 1rem; font-weight: 700; color: #334155; }
.empty-sub   { font-size: 0.875rem; color: #94a3b8; max-width: 28rem; line-height: 1.5; }

/* Table */
.table-outer { overflow-x: auto; }
.gm-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.gm-table thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.gm-table th {
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.gm-row { border-bottom: 1px solid #f1f5f9; transition: background 0.12s; }
.gm-row:hover { background: #f8fafc; }
.gm-row:last-child { border-bottom: none; }
.gm-table td { padding: 0.875rem 1rem; color: #0f172a; vertical-align: middle; }
.text-center { text-align: center !important; }

.code-cell {
  font-family: monospace;
  font-size: 0.8125rem;
  font-weight: 700;
  background: #f1f5f9;
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  color: #0f172a;
}
.nome-cell  { font-weight: 600; color: #0f172a; }
.marca-cell { font-size: 0.875rem; color: #475569; }
.date-cell  { font-size: 0.8125rem; color: #64748b; white-space: nowrap; }
.empty-dash { color: #cbd5e1; }

.temporada-pill, .date-pill, .pecas-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.pecas-pill {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

/* Badges */
.badge { display: inline-block; padding: 0.2rem 0.625rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; }
.badge--green { background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; }
.badge--red   { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
.badge--blue  { background: #0f172a; color: #ffffff; }
.badge--slate { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

/* Footer */
.table-footer { padding: 0.75rem 1rem; border-top: 1px solid #f1f5f9; font-size: 0.75rem; color: #94a3b8; font-weight: 500; text-align: right; }

/* ─── Modal ────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}
.modal-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  width: 100%;
  max-width: 32rem;
  box-shadow: 0 20px 50px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-panel--wide {
  max-width: 38rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.modal-header-left { display: flex; align-items: center; gap: 0.75rem; }
.modal-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: #0f172a;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.modal-title { font-size: 1rem; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; }
.modal-step-badge {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
  margin-top: 0.1rem;
}
.modal-step-badge span {
  font-weight: 800;
  color: #0f172a;
}
.modal-close {
  width: 2rem; height: 2rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.modal-close:hover { background: #f1f5f9; color: #0f172a; }

.modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.125rem; max-height: 75vh; overflow-y: auto; }
.modal-description { font-size: 0.8125rem; color: #64748b; line-height: 1.5; margin: 0; }

/* Form */
.form-row-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
.form-field { display: flex; flex-direction: column; gap: 0.375rem; }
.form-label { font-size: 0.8125rem; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 0.25rem; }
.required-star { color: #0f172a; font-weight: 900; }
.optional-tag { font-size: 0.7rem; font-weight: 500; color: #94a3b8; background: #f1f5f9; padding: 0.05rem 0.4rem; border-radius: 0.25rem; text-transform: uppercase; letter-spacing: 0.04em; }
.field-hint { font-size: 0.75rem; color: #64748b; margin-top: 0.15rem; }

.select-wrap { position: relative; }
.form-select, .form-input {
  width: 100%;
  padding: 0.5625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.form-select { padding-right: 2.25rem; appearance: none; cursor: pointer; }
.form-select:focus, .form-input:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.1); }
.form-select--error, .form-input--error { border-color: #0f172a; }
.form-input::placeholder { color: #94a3b8; }

.select-chevron { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }

.form-error { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: #0f172a; }

/* Passo 2 Peças Autocomplete */
.pecas-ac-container { position: relative; }
.ac-input-wrap { position: relative; }
.ac-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; }
.ac-input {
  width: 100%;
  padding: 0.5625rem 0.875rem 0.5625rem 2.25rem;
  font-size: 0.875rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
}
.ac-input:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.1); }

.ac-dropdown {
  position: absolute;
  top: 100%;
  left: 0; right: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
  max-height: 14rem;
  overflow-y: auto;
  z-index: 30;
  margin-top: 0.25rem;
}
.ac-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.875rem;
}
.ac-item:hover { background: #f8fafc; }
.ac-badge {
  padding: 0.15rem 0.4rem;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  font-family: monospace;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.ac-name { font-weight: 700; color: #0f172a; }
.ac-ref { margin-left: auto; font-size: 0.75rem; color: #64748b; font-family: monospace; }

.pecas-list-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
}
.pecas-list-title {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #475569;
  margin-bottom: 0.625rem;
}
.pecas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1.5rem;
  color: #64748b;
  font-size: 0.8125rem;
  text-align: center;
}

.pecas-table-wrap {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  overflow: hidden;
}
.pecas-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.pecas-table th {
  background: #f1f5f9;
  padding: 0.5rem 0.625rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}
.peca-row td { padding: 0.5rem 0.625rem; border-bottom: 1px solid #f1f5f9; }
.peca-badge {
  padding: 0.15rem 0.4rem;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  font-family: monospace;
  border-radius: 0.25rem;
  font-size: 0.7rem;
}
.maquina-select {
  width: 100%;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  background: #ffffff;
  color: #0f172a;
}
.btn-del-peca {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}
.btn-del-peca:hover { color: #0f172a; background: #e2e8f0; }

.modal-footer {
  display: flex;
  justify-content: space-between;
  gap: 0.625rem;
  padding: 1.125rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: #f8fafc;
}

/* ─── Toast ────────────────────────────────────────── */
.toast-stack { position: fixed; bottom: 1.5rem; right: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 99999; pointer-events: none; }
.toast { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.125rem; border-radius: 0.625rem; font-size: 0.875rem; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.15); max-width: 24rem; pointer-events: auto; }
.toast--success { background: #0f172a; color: #ffffff; }
.toast--error   { background: #0f172a; color: #ffffff; border: 1px solid #334155; }
.toast-icon     { flex-shrink: 0; }
.toast-msg      { line-height: 1.4; }

/* ─── Animations ───────────────────────────────────── */
.spin-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .modal-panel, .modal-leave-active .modal-panel { transition: transform 0.25s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel { transform: translateY(1.5rem) scale(0.97); opacity: 0; }

.toast-enter-active { transition: all 0.3s cubic-bezier(0.32,0.72,0,1); }
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from   { opacity: 0; transform: translateX(1.5rem); }
.toast-leave-to     { opacity: 0; transform: translateX(1.5rem); }
</style>
