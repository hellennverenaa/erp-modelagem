<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Loader2, Plus, RefreshCw, X } from '@lucide/vue'
import api from '../api/axios'

interface Marca {
  id: string
  nome: string
  ativo: boolean
}

const emit = defineEmits<{
  close: []
  created: [marca: Marca]
  updated: [marca: Marca]
}>()

const marcas = ref<Marca[]>([])
const nome = ref('')
const loading = ref(true)
const saving = ref(false)
const updatingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const editingNome = ref('')
const errorMessage = ref('')

async function carregarMarcas() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await api.get<Marca[]>('/admin/marcas/gerenciamento')
    marcas.value = Array.isArray(data) ? data : []
  } catch (error: any) {
    const status = error?.response?.status
    errorMessage.value = status === 403
      ? 'Somente administradores podem gerenciar marcas.'
      : error?.response?.data?.error || 'Não foi possível carregar as marcas. Verifique a conexão com a API.'
  } finally {
    loading.value = false
  }
}

async function cadastrarMarca() {
  const nomeNormalizado = nome.value.trim().replace(/\s+/g, ' ')
  if (!nomeNormalizado || saving.value) return

  saving.value = true
  errorMessage.value = ''
  try {
    const { data } = await api.post<Marca>('/admin/marcas', { nome: nomeNormalizado })
    nome.value = ''
    await carregarMarcas()
    emit('created', data)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Não foi possível cadastrar a marca.'
  } finally {
    saving.value = false
  }
}

async function alternarStatus(marca: Marca) {
  if (updatingId.value) return

  updatingId.value = marca.id
  errorMessage.value = ''
  try {
    const { data } = await api.patch<Marca>(`/admin/marcas/${marca.id}`, { ativo: !marca.ativo })
    await carregarMarcas()
    emit('updated', data)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Não foi possível atualizar o status da marca.'
  } finally {
    updatingId.value = null
  }
}

function iniciarEdicao(marca: Marca) {
  editingId.value = marca.id
  editingNome.value = marca.nome
  errorMessage.value = ''
}

function cancelarEdicao() {
  editingId.value = null
  editingNome.value = ''
}

async function salvarNome(marca: Marca) {
  const nomeNormalizado = editingNome.value.trim().replace(/\s+/g, ' ')
  if (!nomeNormalizado || updatingId.value) return

  updatingId.value = marca.id
  errorMessage.value = ''
  try {
    const { data } = await api.patch<Marca>(`/admin/marcas/${marca.id}`, { nome: nomeNormalizado })
    cancelarEdicao()
    await carregarMarcas()
    emit('updated', data)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Não foi possível renomear a marca.'
  } finally {
    updatingId.value = null
  }
}

onMounted(carregarMarcas)
</script>

<template>
  <Teleport to="body">
    <div class="brand-backdrop" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section
        class="brand-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-manager-title"
      >
        <header class="brand-header">
          <div>
            <p class="brand-eyebrow">ADMINISTRAÇÃO DO CATÁLOGO</p>
            <h2 id="brand-manager-title">Gerenciar marcas</h2>
          </div>
          <button type="button" class="brand-close" aria-label="Fechar" @click="emit('close')">
            <X :size="18" />
          </button>
        </header>

        <div class="brand-content">
          <p class="brand-description">
            As marcas cadastradas ficam disponíveis no formulário de criação de modelos.
          </p>

          <form class="brand-form" @submit.prevent="cadastrarMarca">
            <label for="brand-name">Nome da marca</label>
            <div class="brand-form-row">
              <input
                id="brand-name"
                v-model="nome"
                type="text"
                maxlength="100"
                autocomplete="organization"
                placeholder="Ex.: Marca Exemplo"
                :disabled="saving"
              />
              <button type="submit" class="brand-primary" :disabled="saving || !nome.trim()">
                <Loader2 v-if="saving" :size="15" class="brand-spin" />
                <Plus v-else :size="15" />
                <span>{{ saving ? 'Salvando...' : 'Cadastrar' }}</span>
              </button>
            </div>
          </form>

          <p v-if="errorMessage" class="brand-error" role="alert">{{ errorMessage }}</p>

          <div class="brand-list-heading">
            <h3>Marcas cadastradas</h3>
            <button type="button" class="brand-refresh" :disabled="loading" @click="carregarMarcas">
              <RefreshCw :size="14" :class="{ 'brand-spin': loading }" />
              <span>Atualizar</span>
            </button>
          </div>

          <div v-if="loading" class="brand-state" role="status">Carregando marcas...</div>
          <div v-else-if="marcas.length === 0" class="brand-state">
            Nenhuma marca cadastrada. Cadastre a primeira acima.
          </div>
          <ul v-else class="brand-list">
            <li v-for="marca in marcas" :key="marca.id" class="brand-row">
              <template v-if="editingId === marca.id">
                <input
                  v-model="editingNome"
                  class="brand-edit-input"
                  type="text"
                  maxlength="100"
                  :aria-label="`Novo nome para ${marca.nome}`"
                />
                <button
                  type="button"
                  class="brand-toggle"
                  :disabled="updatingId !== null || !editingNome.trim()"
                  @click="salvarNome(marca)"
                >
                  {{ updatingId === marca.id ? 'Salvando...' : 'Salvar' }}
                </button>
                <button type="button" class="brand-text-button" :disabled="updatingId !== null" @click="cancelarEdicao">
                  Cancelar
                </button>
              </template>
              <template v-else>
                <span class="brand-name">{{ marca.nome }}</span>
                <span class="brand-status" :class="marca.ativo ? 'is-active' : 'is-inactive'">
                  {{ marca.ativo ? 'Ativa' : 'Inativa' }}
                </span>
                <button type="button" class="brand-text-button" @click="iniciarEdicao(marca)">Renomear</button>
                <button
                  type="button"
                  class="brand-toggle"
                  :disabled="updatingId !== null"
                  @click="alternarStatus(marca)"
                >
                  <Loader2 v-if="updatingId === marca.id" :size="14" class="brand-spin" />
                  <span v-else>{{ marca.ativo ? 'Desativar' : 'Reativar' }}</span>
                </button>
              </template>
            </li>
          </ul>
        </div>

        <footer class="brand-footer">
          <button type="button" class="brand-secondary" @click="emit('close')">Concluir</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.brand-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(3px);
}

.brand-panel {
  width: min(100%, 34rem);
  max-height: min(90vh, 46rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.25);
  color: #0f172a;
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}

.brand-header,
.brand-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}

.brand-header h2 { margin: 0.15rem 0 0; font-size: 1.05rem; font-weight: 800; }
.brand-eyebrow { margin: 0; color: #64748b; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; }
.brand-close { display: grid; place-items: center; width: 2rem; height: 2rem; border: 1px solid #e2e8f0; border-radius: 0.4rem; background: #fff; color: #475569; cursor: pointer; }
.brand-content { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem; overflow-y: auto; }
.brand-description { margin: 0; color: #64748b; font-size: 0.82rem; line-height: 1.5; }
.brand-form { display: flex; flex-direction: column; gap: 0.4rem; }
.brand-form label { font-size: 0.78rem; font-weight: 700; color: #334155; }
.brand-form-row { display: flex; gap: 0.5rem; }
.brand-form input { min-width: 0; flex: 1; padding: 0.625rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.45rem; color: #0f172a; font: inherit; font-size: 0.85rem; }
.brand-form input:focus { outline: 2px solid rgba(15, 23, 42, 0.18); border-color: #0f172a; }
.brand-primary,
.brand-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.625rem 0.8rem; border: 1px solid #0f172a; border-radius: 0.45rem; background: #0f172a; color: #fff; font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
.brand-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.brand-error { margin: 0; padding: 0.65rem 0.75rem; border: 1px solid #fecaca; border-radius: 0.45rem; background: #fef2f2; color: #b91c1c; font-size: 0.8rem; }
.brand-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding-top: 0.25rem; }
.brand-list-heading h3 { margin: 0; font-size: 0.85rem; font-weight: 800; }
.brand-refresh { display: inline-flex; align-items: center; gap: 0.35rem; border: 0; background: transparent; color: #475569; font: inherit; font-size: 0.75rem; cursor: pointer; }
.brand-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
.brand-state { padding: 1.25rem; border: 1px dashed #cbd5e1; border-radius: 0.5rem; color: #64748b; font-size: 0.8rem; text-align: center; }
.brand-list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.brand-row { display: flex; align-items: center; gap: 0.65rem; padding: 0.65rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; }
.brand-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 0.85rem; font-weight: 650; }
.brand-edit-input { min-width: 0; flex: 1; padding: 0.4rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.4rem; color: #0f172a; font: inherit; font-size: 0.82rem; }
.brand-text-button { padding: 0.25rem 0.15rem; border: 0; background: transparent; color: #475569; font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
.brand-text-button:hover { color: #0f172a; text-decoration: underline; }
.brand-text-button:disabled { opacity: 0.5; cursor: wait; }
.brand-status { padding: 0.18rem 0.45rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700; }
.brand-status.is-active { background: #dcfce7; color: #166534; }
.brand-status.is-inactive { background: #f1f5f9; color: #64748b; }
.brand-toggle { min-width: 4.5rem; padding: 0.35rem 0.45rem; border: 1px solid #cbd5e1; border-radius: 0.4rem; background: #fff; color: #334155; font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer; }
.brand-toggle:disabled { opacity: 0.55; cursor: wait; }
.brand-footer { justify-content: flex-end; border-top: 1px solid #f1f5f9; border-bottom: 0; }
.brand-secondary { padding-inline: 1rem; }
.brand-spin { animation: brand-spin 0.9s linear infinite; }
@keyframes brand-spin { to { transform: rotate(360deg); } }

@media (max-width: 520px) {
  .brand-form-row { flex-direction: column; }
  .brand-primary { width: 100%; }
  .brand-row { flex-wrap: wrap; }
  .brand-name { flex-basis: calc(100% - 5rem); }
}
</style>
