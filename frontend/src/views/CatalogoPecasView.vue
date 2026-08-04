<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  Layers,
  Plus,
  Search,
  RefreshCw,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Package,
  AlertCircle
} from '@lucide/vue'
import api from '../api/axios'

interface CatalogoPeca {
  id: string
  numero: string
  nome: string
  codigoOriginal: string | null
  descricao: string | null
  ativo: boolean
  createdAt?: string
  updatedAt?: string
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

const pecas = ref<CatalogoPeca[]>([])
const loading = ref(true)
const loadingSave = ref(false)
const showModal = ref(false)
const searchQuery = ref('')
const toasts = ref<Toast[]>([])
let toastCounter = 0

const form = ref({
  numero: '',
  nome: '',
  codigoOriginal: '',
  descricao: ''
})
const formErrors = ref<Record<string, string>>({})

function addToast(type: 'success' | 'error', message: string) {
  const id = ++toastCounter
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

async function fetchPecas() {
  loading.value = true
  try {
    const { data } = await api.get<CatalogoPeca[]>('/catalogo-pecas')
    pecas.value = data || []
  } catch (err) {
    console.error('[CatalogoPecasView] Erro ao carregar peças:', err)
    addToast('error', 'Erro ao carregar catálogo de peças.')
  } finally {
    loading.value = false
  }
}

const filteredPecas = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return pecas.value
  return pecas.value.filter(p =>
    p.numero.toLowerCase().includes(q) ||
    p.nome.toLowerCase().includes(q) ||
    (p.codigoOriginal && p.codigoOriginal.toLowerCase().includes(q))
  )
})

function openModal() {
  form.value = { numero: '', nome: '', codigoOriginal: '', descricao: '' }
  formErrors.value = {}
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function handleSavePeca() {
  formErrors.value = {}

  if (!form.value.numero.trim()) {
    formErrors.value.numero = 'Informe o número da peça (ex: 026).'
  }
  if (!form.value.nome.trim()) {
    formErrors.value.nome = 'Informe o nome da peça (ex: GÁSPEA).'
  }

  if (Object.keys(formErrors.value).length > 0) return

  loadingSave.value = true
  try {
    await api.post('/catalogo-pecas', {
      numero: form.value.numero.trim(),
      nome: form.value.nome.trim().toUpperCase(),
      codigoOriginal: form.value.codigoOriginal.trim() || null,
      descricao: form.value.descricao.trim() || null
    })

    addToast('success', 'Peça cadastrada com sucesso no catálogo.')
    closeModal()
    await fetchPecas()
  } catch (err: any) {
    console.error('[CatalogoPecasView] Erro ao salvar peça:', err)
    const msg = err.response?.data?.error || 'Erro ao cadastrar peça.'
    addToast('error', msg)
  } finally {
    loadingSave.value = false
  }
}

onMounted(() => {
  fetchPecas()
})
</script>

<template>
  <div class="cat-root">
    <!-- Toasts -->
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
            <XCircle v-else :size="16" class="toast-icon" aria-hidden="true" />
            <span class="toast-msg">{{ toast.message }}</span>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- Header -->
    <header class="cat-header">
      <div class="cat-header-left">
        <div class="page-icon-wrap" aria-hidden="true">
          <Layers :size="20" />
        </div>
        <div>
          <h1 class="cat-title">Catálogo Técnico de Peças</h1>
          <p class="cat-subtitle">Cadastre e gerencie a lista mestra de peças padronizadas para corte e modelagem.</p>
        </div>
      </div>
      <div class="cat-header-actions">
        <button
          type="button"
          class="btn-ghost"
          :disabled="loading"
          @click="fetchPecas"
          aria-label="Recarregar catálogo"
        >
          <RefreshCw :size="15" :class="{ 'spin-anim': loading }" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn-primary"
          @click="openModal"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>Nova Peça Técnica</span>
        </button>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="cat-toolbar">
      <div class="search-wrap">
        <Search :size="15" class="search-icon" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Buscar por número (ex: 026), nome (ex: GÁSPEA) ou código..."
          aria-label="Buscar peças no catálogo"
        />
      </div>
    </div>

    <!-- Tabela -->
    <div class="table-card">
      <div v-if="loading" class="table-loading">
        <div v-for="i in 5" :key="i" class="skeleton-row">
          <div class="skel skel--short"></div>
          <div class="skel skel--mid"></div>
          <div class="skel skel--mid"></div>
        </div>
      </div>

      <div v-else-if="filteredPecas.length === 0" class="table-empty">
        <Package :size="40" class="empty-icon" aria-hidden="true" />
        <p class="empty-title">Nenhuma peça encontrada</p>
        <p class="empty-sub">Cadastre peças técnicas no catálogo para uso no fluxo de corte.</p>
      </div>

      <div v-else class="table-outer">
        <table class="cat-table">
          <thead>
            <tr>
              <th scope="col" style="width: 100px; text-align: center;">Número</th>
              <th scope="col">Nome da Peça Técnica</th>
              <th scope="col">Código Original / Referência</th>
              <th scope="col">Descrição / Observações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="peca in filteredPecas" :key="peca.id" class="cat-row">
              <td style="text-align: center;">
                <span class="badge-number">{{ peca.numero }}</span>
              </td>
              <td>
                <strong class="peca-nome">{{ peca.nome }}</strong>
              </td>
              <td class="code-cell">
                {{ peca.codigoOriginal || '—' }}
              </td>
              <td class="desc-cell">
                {{ peca.descricao || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && filteredPecas.length > 0" class="table-footer">
        <span>{{ filteredPecas.length }} peça{{ filteredPecas.length !== 1 ? 's' : '' }} cadastrada{{ filteredPecas.length !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Modal Nova Peça -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-pecas"
          @click.self="closeModal"
        >
          <div class="modal-panel">
            <div class="modal-header">
              <div class="modal-header-left">
                <div class="modal-icon-wrap" aria-hidden="true">
                  <Plus :size="18" />
                </div>
                <h2 id="modal-title-pecas" class="modal-title">Nova Peça no Catálogo</h2>
              </div>
              <button
                type="button"
                class="modal-close"
                @click="closeModal"
                aria-label="Fechar modal"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <div class="modal-body">
              <!-- Número -->
              <div class="form-field">
                <label for="txt-numero" class="form-label">
                  Número Identificador <span class="required-star">*</span>
                </label>
                <input
                  id="txt-numero"
                  v-model="form.numero"
                  type="text"
                  class="form-input"
                  :class="{ 'form-input--error': formErrors.numero }"
                  placeholder="Ex: 026, 620"
                />
                <span v-if="formErrors.numero" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.numero }}
                </span>
              </div>

              <!-- Nome -->
              <div class="form-field">
                <label for="txt-nome" class="form-label">
                  Nome da Peça Técnica <span class="required-star">*</span>
                </label>
                <input
                  id="txt-nome"
                  v-model="form.nome"
                  type="text"
                  class="form-input"
                  :class="{ 'form-input--error': formErrors.nome }"
                  placeholder="Ex: GÁSPEA, BIQUEIRA, VISTA"
                />
                <span v-if="formErrors.nome" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.nome }}
                </span>
              </div>

              <!-- Código Original -->
              <div class="form-field">
                <label for="txt-codigo" class="form-label">
                  Código Original / Referência <span class="optional-tag">opcional</span>
                </label>
                <input
                  id="txt-codigo"
                  v-model="form.codigoOriginal"
                  type="text"
                  class="form-input"
                  placeholder="Ex: 026_GAS-1"
                />
              </div>

              <!-- Descrição -->
              <div class="form-field">
                <label for="txt-desc" class="form-label">
                  Descrição / Notas <span class="optional-tag">opcional</span>
                </label>
                <textarea
                  id="txt-desc"
                  v-model="form.descricao"
                  class="form-textarea"
                  placeholder="Observações técnicas sobre o corte ou material desta peça..."
                  rows="3"
                ></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn-outline"
                @click="closeModal"
                :disabled="loadingSave"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="btn-primary"
                @click="handleSavePeca"
                :disabled="loadingSave"
              >
                <Loader2 v-if="loadingSave" :size="15" class="spin-anim" aria-hidden="true" />
                <Plus v-else :size="15" aria-hidden="true" />
                <span>{{ loadingSave ? 'Cadastrando...' : 'Cadastrar Peça' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cat-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 80rem;
  margin: 0 auto;
}

.cat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.cat-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.page-icon-wrap {
  width: 2.5rem;
  height: 2.5rem;
  background: #0f172a;
  color: #ffffff;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cat-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.cat-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.125rem 0 0;
}
.cat-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Toolbar */
.cat-toolbar {
  display: flex;
  gap: 1rem;
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
  color: #64748b;
}
.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 2.25rem;
  font-size: 0.875rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  outline: none;
}
.search-input:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1);
}

/* Table */
.table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.cat-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}
.cat-table th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}
.cat-row td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
}
.cat-row:hover {
  background: #f8fafc;
}
.badge-number {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  font-family: monospace;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.peca-nome {
  font-weight: 700;
  color: #0f172a;
}
.code-cell {
  font-family: monospace;
  color: #475569;
  font-size: 0.8125rem;
}
.desc-cell {
  color: #64748b;
  font-size: 0.8125rem;
}

.table-footer {
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}
.modal-panel {
  background: #ffffff;
  border-radius: 0.75rem;
  width: 100%;
  max-width: 28rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.modal-header {
  padding: 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.modal-icon-wrap {
  width: 2rem;
  height: 2rem;
  background: #0f172a;
  color: #ffffff;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.modal-close {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.form-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #475569;
}
.required-star {
  color: #0f172a;
  font-weight: 900;
}
.optional-tag {
  font-size: 0.6875rem;
  color: #94a3b8;
  text-transform: lowercase;
  font-weight: normal;
}
.form-input, .form-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  outline: none;
}
.form-input:focus, .form-textarea:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1);
}
.form-input--error {
  border-color: #000000;
}
.form-error {
  font-size: 0.75rem;
  color: #000000;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.modal-footer {
  padding: 1rem 1.25rem;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Buttons */
.btn-primary {
  background: #0f172a;
  color: #ffffff;
  border: none;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  border-radius: 0.375rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.btn-primary:hover {
  background: #1e293b;
}
.btn-ghost, .btn-outline {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 0.375rem;
  cursor: pointer;
}
.spin-anim {
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Toast */
.toast-stack {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.8125rem;
  font-weight: 600;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
</style>
