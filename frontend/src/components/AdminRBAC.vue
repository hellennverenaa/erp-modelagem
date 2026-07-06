<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sliders,
  AlertCircle
} from '@lucide/vue'
import api from '../api/axios'

interface User {
  id: string
  nomeCompleto: string
  usuario: string
  cargo: string
  email: string | null
  ativo: boolean
  ultimoAcesso: string | null
  perfil: {
    id: string
    nome: string
    descricao: string | null
  }
  planta: {
    id: string
    nome: string
  }
}

interface Perfil {
  id: string
  nome: string
  descricao: string | null
}

interface Sector {
  id: string
  nome: string
  isCondicional: boolean
}

interface Permission {
  id?: string
  perfilId: string
  setorId: string | null
  acao: string
  permitido: boolean
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// State
const activeTab = ref<'usuarios' | 'permissoes'>('usuarios')
const users = ref<User[]>([])
const profiles = ref<Perfil[]>([])
const sectors = ref<Sector[]>([])
const permissions = ref<Permission[]>([])

const selectedPerfilId = ref<string>('')
const filterText = ref<string>('')

// Loaders
const loadingUsers = ref(false)
const loadingRBAC = ref(false)
const updatingPermissions = ref<Record<string, boolean>>({})
const updatingUserProfile = ref<Record<string, boolean>>({})

// Toasts
const toasts = ref<Toast[]>([])
let toastIdCounter = 0

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const id = toastIdCounter++
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

// Fetch Functions
async function fetchUsers() {
  loadingUsers.value = true
  try {
    const { data } = await api.get('/admin/usuarios')
    users.value = data
  } catch (error: any) {
    showToast('Falha ao carregar lista de usuários.', 'error')
  } finally {
    loadingUsers.value = false
  }
}

async function fetchMetadata() {
  try {
    const [profilesRes, sectorsRes] = await Promise.all([
      api.get('/admin/perfis'),
      api.get('/admin/setores')
    ])
    profiles.value = profilesRes.data
    sectors.value = sectorsRes.data

    if (profiles.value.length > 0) {
      selectedPerfilId.value = profiles.value[0].id
    }
  } catch (error) {
    showToast('Erro ao carregar perfis e setores.', 'error')
  }
}

async function fetchPermissions() {
  if (!selectedPerfilId.value) return
  loadingRBAC.value = true
  try {
    const { data } = await api.get(`/admin/permissoes/${selectedPerfilId.value}`)
    permissions.value = data
  } catch (error) {
    showToast('Erro ao obter matriz de acessos.', 'error')
  } finally {
    loadingRBAC.value = false
  }
}

async function alterarPerfilColaborador(usuarioId: string, event: Event) {
  const target = event.target as HTMLSelectElement
  const novoPerfilId = target.value

  updatingUserProfile.value[usuarioId] = true
  try {
    await api.put(`/admin/usuarios/${usuarioId}/perfil`, {
      perfilId: novoPerfilId
    }, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('erp_token')}`
      }
    })

    showToast('Perfil do colaborador atualizado com sucesso.')
    
    // Atualiza localmente o perfil do usuário
    const idx = users.value.findIndex(u => u.id === usuarioId)
    if (idx !== -1) {
      const perfilEncontrado = profiles.value.find(p => p.id === novoPerfilId)
      if (perfilEncontrado) {
        users.value[idx].perfil = {
          id: perfilEncontrado.id,
          nome: perfilEncontrado.nome,
          descricao: perfilEncontrado.descricao
        }
      }
    }
  } catch (error: any) {
    showToast('Falha ao atualizar perfil do colaborador.', 'error')
    await fetchUsers()
  } finally {
    updatingUserProfile.value[usuarioId] = false
  }
}

// Matrix helper checking if allowed
function isAllowed(setorId: string | null, acao: string): boolean {
  const perm = permissions.value.find(
    (p) => p.setorId === setorId && p.acao === acao
  )
  return perm ? perm.permitido : false
}

// Action execution
async function togglePermission(setorId: string | null, acao: string) {
  const currentVal = isAllowed(setorId, acao)
  const newVal = !currentVal

  const key = `${setorId || 'global'}-${acao}`
  updatingPermissions.value[key] = true

  try {
    const { data } = await api.put('/admin/permissoes', {
      perfilId: selectedPerfilId.value,
      setorId,
      acao,
      permitido: newVal
    })

    // Update local permissions state list
    const returnedItems = Array.isArray(data) ? data : [data]
    for (const item of returnedItems) {
      const idx = permissions.value.findIndex(
        (p) => p.setorId === item.setorId && p.acao === item.acao
      )
      if (idx !== -1) {
        permissions.value[idx].permitido = item.permitido
      } else {
        permissions.value.push(item)
      }
    }

    const actionLabel = getActionLabel(acao)
    const sectorName = setorId ? sectors.value.find(s => s.id === setorId)?.nome : 'Geral/Global'
    showToast(`Permissão "${actionLabel}" (${sectorName}) atualizada com sucesso.`)
  } catch (error) {
    showToast('Falha ao salvar alteração de permissão.', 'error')
  } finally {
    updatingPermissions.value[key] = false
  }
}

// Helpers
function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    BIPAR_ENTRADA: 'Bipar Entrada',
    BIPAR_SAIDA: 'Bipar Saída',
    REVISAO_MAQUINA: 'Revisão Máquina',
    FECHAMENTO_LOTE: 'Fechamento Lote',
    PREENCHER_CHECKLIST: 'Checklist Setor',
    INSPECIONAR_SETOR: 'Inspeção Qualidade',
    EDITAR_ROTA: 'Editar Rota',
    ADMINISTRAR_RBAC: 'Administrar RBAC',
    REGISTRAR_VEREDICTO_FINAL: 'Veredito Final'
  }
  return map[action] || action
}

const globalActions = [
  'EDITAR_ROTA',
  'ADMINISTRAR_RBAC',
  'REGISTRAR_VEREDICTO_FINAL'
]

const sectorActions = [
  'BIPAR_ENTRADA',
  'BIPAR_SAIDA',
  'PREENCHER_CHECKLIST',
  'REVISAO_MAQUINA',
  'FECHAMENTO_LOTE',
  'INSPECIONAR_SETOR'
]

// Computed list of filtered users
const filteredUsers = computed(() => {
  if (!filterText.value.trim()) return users.value
  const query = filterText.value.toLowerCase()
  return users.value.filter(
    (u) =>
      u.nomeCompleto.toLowerCase().includes(query) ||
      u.usuario.toLowerCase().includes(query) ||
      u.cargo.toLowerCase().includes(query) ||
      (u.perfil && u.perfil.nome.toLowerCase().includes(query))
  )
})

watch(selectedPerfilId, () => {
  fetchPermissions()
})

onMounted(() => {
  fetchUsers()
  fetchMetadata()
})
</script>

<template>
  <div class="rbac-container">
    <!-- View Header -->
    <header class="view-header">
      <div class="header-left">
        <h1 class="view-title">Gestão de Perfis &amp; Permissões (RBAC)</h1>
        <p class="view-subtitle">Controle matriz de acesso a setores, bipagem e auditorias no chão de fábrica.</p>
      </div>
      <div class="header-right">
        <!-- Tab Switches -->
        <div class="tabs-nav" role="tablist">
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'usuarios' }"
            @click="activeTab = 'usuarios'"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'usuarios'"
          >
            <Users :size="16" aria-hidden="true" />
            <span>Colaboradores</span>
          </button>
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'permissoes' }"
            @click="activeTab = 'permissoes'"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'permissoes'"
          >
            <Sliders :size="16" aria-hidden="true" />
            <span>Matriz de Acessos</span>
          </button>
        </div>
      </div>
    </header>

    <!-- CONTENT MODULES -->
    <div class="tab-content">
      <!-- TAB 1: USERS -->
      <Transition name="fade-slide">
        <div v-if="activeTab === 'usuarios'" class="tab-panel" role="tabpanel">
          <div class="panel-card">
            <!-- Filter Bar -->
            <div class="filter-bar">
              <div class="search-input-wrapper">
                <Search :size="16" class="search-icon" aria-hidden="true" />
                <input
                  type="text"
                  v-model="filterText"
                  placeholder="Filtrar por nome, usuário, perfil ou cargo..."
                  class="search-input"
                />
              </div>
              <button class="refresh-btn" @click="fetchUsers" :disabled="loadingUsers" title="Atualizar dados">
                <RefreshCw :size="16" :class="{ 'spin-anim': loadingUsers }" aria-hidden="true" />
              </button>
            </div>

            <!-- Table Container -->
            <div class="table-outer">
              <div v-if="loadingUsers" class="loading-state">
                <RefreshCw :size="32" class="spin-anim loading-spinner" />
                <span>Carregando lista de colaboradores...</span>
              </div>
              
              <table v-else class="corp-table">
                <thead>
                  <tr>
                    <th>Nome Completo</th>
                    <th>Usuário</th>
                    <th>Cargo</th>
                    <th>Perfil Acesso</th>
                    <th>Planta Fabril</th>
                    <th class="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in filteredUsers" :key="user.id">
                    <td class="td-primary">
                      <div class="user-meta">
                        <span class="user-display-name">{{ user.nomeCompleto }}</span>
                        <span class="user-email">{{ user.email || 'Sem e-mail cadastrado' }}</span>
                      </div>
                    </td>
                    <td><code class="user-code">{{ user.usuario }}</code></td>
                    <td class="text-muted">{{ user.cargo }}</td>
                    <td>
                      <div class="table-select-wrapper">
                        <select
                          :value="user.perfil?.id"
                          class="table-select-profile"
                          @change="alterarPerfilColaborador(user.id, $event)"
                          :disabled="updatingUserProfile[user.id]"
                        >
                          <option v-for="prof in profiles" :key="prof.id" :value="prof.id">
                            {{ prof.nome }}
                          </option>
                        </select>
                        <RefreshCw v-if="updatingUserProfile[user.id]" :size="12" class="spin-anim select-spinner" aria-hidden="true" />
                      </div>
                    </td>
                    <td class="text-muted">{{ user.planta?.nome || '-' }}</td>
                    <td class="text-center">
                      <span :class="['status-pill', user.ativo ? 'status-pill--active' : 'status-pill--inactive']">
                        <CheckCircle2 v-if="user.ativo" :size="12" aria-hidden="true" />
                        <XCircle v-else :size="12" aria-hidden="true" />
                        <span>{{ user.ativo ? 'Ativo' : 'Inativo' }}</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-if="filteredUsers.length === 0">
                    <td colspan="6" class="table-empty">
                      Nenhum colaborador corresponde aos filtros de busca.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Transition>

      <!-- TAB 2: PERMISSIONS -->
      <Transition name="fade-slide">
        <div v-if="activeTab === 'permissoes'" class="tab-panel" role="tabpanel">
          <div class="matrix-setup">
            <!-- Filter Options Card -->
            <div class="panel-card config-card">
              <div class="dropdown-group">
                <label for="perfil-select" class="dropdown-label">Perfil de Usuário</label>
                <div class="select-wrapper">
                  <select id="perfil-select" v-model="selectedPerfilId" class="perfil-select">
                    <option v-for="prof in profiles" :key="prof.id" :value="prof.id">
                      {{ prof.nome }} — {{ prof.descricao || 'Sem descrição' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Loader or matrix -->
            <div v-if="loadingRBAC" class="loading-state card-loading">
              <RefreshCw :size="32" class="spin-anim loading-spinner" />
              <span>Buscando matriz de permissões do perfil selecionado...</span>
            </div>

            <div v-else class="matrix-layout">
              <!-- Global Actions Grid -->
              <section class="matrix-section">
                <h3 class="section-title">Ações e Configurações Globais</h3>
                <div class="global-actions-grid">
                  <div v-for="action in globalActions" :key="action" class="global-action-card">
                    <div class="action-info">
                      <h4 class="action-title-label">{{ getActionLabel(action) }}</h4>
                      <code class="action-code-tag">{{ action }}</code>
                    </div>
                    <div class="action-control">
                      <button
                        type="button"
                        class="matrix-toggle"
                        :class="{ 'matrix-toggle--active': isAllowed(null, action) }"
                        :disabled="updatingPermissions[`global-${action}`]"
                        @click="togglePermission(null, action)"
                        :aria-label="`Permitir ação global ${getActionLabel(action)}`"
                      >
                        <RefreshCw v-if="updatingPermissions[`global-${action}`]" :size="12" class="spin-anim toggle-spinner" aria-hidden="true" />
                        <span v-else class="matrix-toggle-thumb"></span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Sector Matrix Grid -->
              <section class="matrix-section">
                <h3 class="section-title">Controle Operacional por Setor do Chão de Fábrica</h3>
                <div class="table-outer shadow-matrix">
                  <table class="matrix-table">
                    <thead>
                      <tr>
                        <th class="sticky-col">Setor de Produção</th>
                        <th v-for="action in sectorActions" :key="action" class="text-center">
                          <div class="action-header-cell">
                            <span>{{ getActionLabel(action) }}</span>
                            <code class="action-header-code">{{ action }}</code>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="sector in sectors" :key="sector.id">
                        <td class="sticky-col sector-name-cell">
                          <div class="sector-meta">
                            <span class="sector-title-name">{{ sector.nome }}</span>
                            <span v-if="sector.isCondicional" class="cond-badge">Condicional</span>
                          </div>
                        </td>
                        <td v-for="action in sectorActions" :key="action" class="text-center">
                          <button
                            type="button"
                            class="matrix-toggle"
                            :class="{ 'matrix-toggle--active': isAllowed(sector.id, action) }"
                            :disabled="updatingPermissions[`${sector.id}-${action}`]"
                            @click="togglePermission(sector.id, action)"
                            :aria-label="`Permitir ação ${getActionLabel(action)} no setor ${sector.nome}`"
                          >
                            <RefreshCw v-if="updatingPermissions[`${sector.id}-${action}`]" :size="12" class="spin-anim toggle-spinner" aria-hidden="true" />
                            <span v-else class="matrix-toggle-thumb"></span>
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- TOAST NOTIFICATION CONTAINER -->
    <div class="toast-container" aria-live="polite">
      <TransitionGroup name="toast-anim">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast-card', `toast-card--${toast.type}`]"
        >
          <CheckCircle2 v-if="toast.type === 'success'" :size="18" class="toast-icon" aria-hidden="true" />
          <AlertCircle v-else :size="18" class="toast-icon" aria-hidden="true" />
          <span class="toast-message">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════
   ROOT CONTAINER
═══════════════════════════════════════ */
.rbac-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

/* ═══════════════════════════════════════
   VIEW HEADER
═══════════════════════════════════════ */
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.view-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0 0 0.25rem;
}

.view-subtitle {
  font-size: 0.875rem;
  color: #475569;
  margin: 0;
  line-height: 1.5;
}

@media (min-width: 1920px) {
  .view-title { font-size: 2rem; }
  .view-subtitle { font-size: 1rem; }
}

/* ── Tab Control Buttons ── */
.tabs-nav {
  display: flex;
  background: #cbd5e1;
  padding: 0.25rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  gap: 0.125rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  background: transparent;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  font-family: inherit;
  color: #475569;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab-btn:hover {
  color: #0f172a;
}

.tab-btn--active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

@media (min-width: 1920px) {
  .tab-btn { font-size: 0.9375rem; padding: 0.625rem 1.25rem; }
}

/* ═══════════════════════════════════════
   TAB CONTENT
═══════════════════════════════════════ */
.tab-content {
  position: relative;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Panel Card base styling */
.panel-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}

/* ═══════════════════════════════════════
   TAB 1: USERS LIST
═══════════════════════════════════════ */
.filter-bar {
  display: flex;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: #f8fafc;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 28rem;
}

.search-icon {
  position: absolute;
  left: 0.875rem;
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.875rem 0.5rem 2.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  border-color: #1e40af;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.08);
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  color: #475569;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  border-color: #cbd5e1;
  color: #0f172a;
  background: #f8fafc;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Corporate Table */
.table-outer {
  width: 100%;
  overflow-x: auto;
}

.corp-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}

.corp-table th {
  background: #f8fafc;
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  color: #475569;
  border-bottom: 1.5px solid #e2e8f0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.corp-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

.corp-table tbody tr:hover {
  background: #f8fafc;
}

.td-primary {
  font-weight: 600;
  color: #0f172a;
}

.user-meta {
  display: flex;
  flex-direction: column;
}

.user-display-name {
  font-weight: 700;
  font-size: 0.875rem;
  color: #0f172a;
}

.user-email {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 400;
}

.user-code {
  font-family: monospace;
  font-weight: 600;
  background: #f1f5f9;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.text-muted {
  color: #475569;
}

.badge-profile {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.table-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.table-select-profile {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 0.25rem 1.5rem 0.25rem 0.5rem;
  border-radius: 0.375rem;
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%231e40af' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.375rem center;
  background-size: 0.75rem;
}

.table-select-profile:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}

.table-select-profile:focus {
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.12);
}

.table-select-profile:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.select-spinner {
  color: #1e40af;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 2rem;
  font-size: 0.75rem;
  font-weight: 700;
}

.status-pill--active {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-pill--inactive {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.table-empty {
  text-align: center;
  padding: 3rem 1rem;
  color: #64748b;
  font-style: italic;
}

.text-center { text-align: center; }

/* ═══════════════════════════════════════
   TAB 2: PERMISSIONS MATRIX
═══════════════════════════════════════ */
.matrix-setup {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.config-card {
  padding: 1.25rem;
}

.dropdown-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 24rem;
}

.dropdown-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-wrapper {
  position: relative;
}

.perfil-select {
  width: 100%;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.perfil-select:focus {
  border-color: #1e40af;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.08);
}

/* Loading Panel Card */
.card-loading {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 4rem 1.5rem;
}

/* Matrix Layout Section */
.matrix-layout {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.matrix-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-size: 1.0625rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
  border-left: 3px solid #1e40af;
  padding-left: 0.625rem;
}

/* Global Actions Cards */
.global-actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1rem;
}

.global-action-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.01);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.global-action-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
}

.action-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.action-title-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #0f172a;
}

.action-code-tag {
  font-family: monospace;
  font-size: 0.75rem;
  color: #64748b;
}

/* Toggle Switches */
.matrix-toggle {
  width: 2.75rem; /* 44px */
  height: 1.5rem; /* 24px */
  background-color: #cbd5e1; /* slate-300 quando desligado */
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: background-color 0.25s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.25s;
}

.matrix-toggle:focus-visible {
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.2);
}

.matrix-toggle--active {
  background-color: #0f172a; /* Carvão escuro quando ligado */
  border-color: #0f172a;
}

.matrix-toggle-thumb {
  width: 1.125rem; /* 18px */
  height: 1.125rem; /* 18px */
  background-color: #ffffff;
  border-radius: 50%;
  position: absolute;
  left: 2px;
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.matrix-toggle--active .matrix-toggle-thumb {
  transform: translateX(20px);
}

.matrix-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-spinner {
  color: #1e40af;
  margin: 0 auto;
}

/* Matrix Table */
.shadow-matrix {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.matrix-table th {
  background: #f8fafc;
  padding: 1rem;
  font-weight: 700;
  color: #475569;
  border-bottom: 1.5px solid #e2e8f0;
  min-width: 9rem;
}

.matrix-table th.sticky-col,
.matrix-table td.sticky-col {
  position: sticky;
  left: 0;
  background: #f8fafc;
  border-right: 1.5px solid #e2e8f0;
  z-index: 1;
  min-width: 14rem;
}

.matrix-table td.sticky-col {
  background: #ffffff;
}

.matrix-table tr:hover td.sticky-col {
  background: #f8fafc;
}

.matrix-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
}

.matrix-table tr:hover {
  background: #f8fafc;
}

.action-header-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  text-align: center;
}

.action-header-code {
  font-family: monospace;
  font-size: 0.6875rem;
  color: #94a3b8;
  font-weight: 400;
}

.sector-name-cell {
  font-weight: 700;
  color: #0f172a;
}

.sector-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.cond-badge {
  font-size: 0.6875rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

/* ═══════════════════════════════════════
   COMMON STATES / ANIMATIONS
═══════════════════════════════════════ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
  color: #64748b;
  font-weight: 500;
}

.loading-spinner {
  color: #1e40af;
}

.spin-anim {
  animation: rotateSpinner 0.8s linear infinite;
}

@keyframes rotateSpinner {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ═══════════════════════════════════════
   TOASTS SYSTEM
═══════════════════════════════════════ */
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 50;
}

.toast-card {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
  border-left: 4px solid #cbd5e1;
  min-width: 16rem;
  max-width: 24rem;
}

.toast-card--success {
  border-left-color: #166534;
  background: #f0fdf4;
  color: #166534;
}

.toast-card--error {
  border-left-color: #991b1b;
  background: #fef2f2;
  color: #991b1b;
}

.toast-icon {
  flex-shrink: 0;
}

.toast-message {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

/* Toast Animations */
.toast-anim-enter-active {
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.toast-anim-leave-active {
  transition: all 0.2s ease;
}
.toast-anim-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* TV scaling */
@media (min-width: 1920px) {
  .view-title { font-size: 2rem; }
  .view-subtitle { font-size: 1rem; }
  .search-input { font-size: 1rem; padding-top: 0.625rem; padding-bottom: 0.625rem; }
  .corp-table { font-size: 1rem; }
  .perfil-select { font-size: 1rem; }
  .action-title-label { font-size: 1rem; }
  .matrix-table { font-size: 1rem; }
}

@media (min-width: 2560px) {
  .view-title { font-size: 2.75rem; }
  .view-subtitle { font-size: 1.375rem; }
  .search-input { font-size: 1.25rem; }
  .corp-table { font-size: 1.25rem; }
  .perfil-select { font-size: 1.25rem; }
  .action-title-label { font-size: 1.25rem; }
  .matrix-table { font-size: 1.25rem; }
}
</style>
