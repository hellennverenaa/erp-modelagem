<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sliders,
  AlertCircle,
  ChevronDown,
  ArrowRight
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'

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
  setorId: string | null
  setor: {
    id: string
    nome: string
  } | null
}

interface Perfil {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
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

interface PermissionDefinition {
  acao: string
  label: string
}

interface ScreenDefinition {
  routeName: string
  routePath: string
  label: string
  viewPermission: string
  editPermission?: string
}

interface PermissionCatalog {
  screens: ScreenDefinition[]
  globalActions: PermissionDefinition[]
  sectorActions: PermissionDefinition[]
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

const contasAdminAutomacao = new Set([
  'hellen.magalhaes',
  'jose.falcao',
  'leone.santana',
])

function isContaAdminAutomacao(usuario: string) {
  return contasAdminAutomacao.has(usuario.trim().toLowerCase())
}

function isPerfilSistema(nome: string) {
  return ['ADMIN', 'VISUALIZADOR', 'ADMIN_AUTOMACAO'].includes(nome)
}

// State
const activeTab = ref<'usuarios' | 'permissoes'>('usuarios')
const users = ref<User[]>([])
const profiles = ref<Perfil[]>([])
const sectors = ref<Sector[]>([])
const permissions = ref<Permission[]>([])
const persistedPermissions = ref<Permission[]>([])
const permissionCatalog = ref<PermissionCatalog>({ screens: [], globalActions: [], sectorActions: [] })

const selectedPerfilId = ref<string>('')
type WizardStep = 'telas' | 'globais' | 'setores' | 'revisao'
const wizardSteps: Array<{ id: WizardStep; title: string; description: string }> = [
  { id: 'telas', title: 'Acesso às telas', description: 'Escolha quais áreas do ERP o perfil pode consultar ou editar.' },
  { id: 'globais', title: 'Ações globais', description: 'Configure ações que valem para toda a aplicação.' },
  { id: 'setores', title: 'Permissões por setor', description: 'Defina as operações disponíveis em cada setor ativo.' },
  { id: 'revisao', title: 'Revisão', description: 'Confira as diferenças antes de gravá-las.' },
]
const expandedWizardStep = ref<WizardStep | null>('telas')
const showProfileManager = ref(false)
const configurationJustSaved = ref(false)
const filterText = ref<string>('')
const showPerfilModal = ref(false)
const editingPerfilId = ref<string | null>(null)
const savingPerfil = ref(false)
const formPerfil = ref({ nome: '', descricao: '' })

// Loaders
const loadingUsers = ref(false)
const usersLoadError = ref('')
const loadingRBAC = ref(false)
const metadataLoadError = ref('')
const permissionLoadError = ref('')
const savingConfiguration = ref(false)
let permissionFetchSequence = 0
const showAudit = ref(false)
const auditLoading = ref(false)
const auditError = ref('')
const auditItems = ref<AuditEntry[]>([])
const auditTotal = ref(0)
const updatingUserProfile = ref<Record<string, boolean>>({})

interface AuditEntry {
  id: string
  acao: string
  entidadeTipo: string
  dadosAnteriores: Record<string, unknown> | null
  dadosNovos: Record<string, unknown> | null
  createdAt: string
  usuario: { nomeCompleto: string; usuario: string } | null
}

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
  usersLoadError.value = ''
  try {
    const { data } = await api.get('/admin/usuarios')
    users.value = data
  } catch (error: any) {
    usersLoadError.value = error.response?.data?.error || 'Falha ao carregar lista de usuários.'
    users.value = []
    showToast(usersLoadError.value, 'error')
  } finally {
    loadingUsers.value = false
  }
}

async function fetchMetadata() {
  metadataLoadError.value = ''
  try {
    const [profilesRes, sectorsRes, catalogRes] = await Promise.all([
      api.get('/admin/perfis'),
      api.get('/admin/setores'),
      api.get('/admin/permissoes/catalogo'),
    ])
    profiles.value = profilesRes.data
    sectors.value = sectorsRes.data
    permissionCatalog.value = catalogRes.data

    if (!profiles.value.some(profile => profile.id === selectedPerfilId.value && profile.ativo)) {
      selectedPerfilId.value = profiles.value.find(profile => profile.ativo)?.id || ''
    }
  } catch (error: any) {
    metadataLoadError.value = error.response?.data?.error || 'Erro ao carregar perfis, setores e catálogo de permissões.'
    showToast(metadataLoadError.value, 'error')
  }
}

function abrirNovoPerfil() {
  editingPerfilId.value = null
  formPerfil.value = { nome: '', descricao: '' }
  showPerfilModal.value = true
}

function editarPerfil(perfil: Perfil) {
  editingPerfilId.value = perfil.id
  formPerfil.value = { nome: perfil.nome, descricao: perfil.descricao || '' }
  showPerfilModal.value = true
}

async function salvarPerfil() {
  if (savingConfiguration.value) return
  if (pendingPermissions.value.length && !window.confirm('Descartar as alterações não salvas da matriz antes de salvar o perfil?')) return
  const nome = formPerfil.value.nome.trim()
  if (nome.length < 2) {
    showToast('Informe um nome de perfil com pelo menos 2 caracteres.', 'error')
    return
  }

  savingPerfil.value = true
  try {
    const payload = { nome, descricao: formPerfil.value.descricao.trim() || null }
    const response = editingPerfilId.value
      ? await api.patch(`/admin/perfis/${editingPerfilId.value}`, payload)
      : await api.post('/admin/perfis', payload)

    const perfilSalvo = response.data as Perfil
    discardConfiguration()
    const isEditing = editingPerfilId.value !== null
    showPerfilModal.value = false
    await fetchMetadata()
    selectedPerfilId.value = perfilSalvo.id
    showToast(isEditing ? 'Perfil atualizado.' : 'Perfil criado.')
  } catch (error: any) {
    showToast(error.response?.data?.error || 'Não foi possível salvar o perfil.', 'error')
  } finally {
    savingPerfil.value = false
  }
}

async function alternarStatusPerfil(perfil: Perfil) {
  if (savingConfiguration.value) return
  if (pendingPermissions.value.length && !window.confirm('Descartar as alterações não salvas da matriz?')) return
  const ativo = !perfil.ativo
  if (!ativo && isPerfilSistema(perfil.nome)) {
    showToast(`O perfil ${perfil.nome} é protegido.`, 'error')
    return
  }
  if (!ativo && !window.confirm(`Desativar o perfil ${perfil.nome}? Usuários vinculados precisam ser reatribuídos antes.`)) {
    return
  }

  try {
    await api.patch(`/admin/perfis/${perfil.id}`, { ativo })
    discardConfiguration()
    await fetchMetadata()
    if (!ativo && selectedPerfilId.value === perfil.id) {
      selectedPerfilId.value = profiles.value.find(item => item.ativo)?.id || ''
    }
    showToast(ativo ? 'Perfil reativado.' : 'Perfil desativado.')
  } catch (error: any) {
    showToast(error.response?.data?.error || 'Não foi possível alterar o status do perfil.', 'error')
  }
}

async function fetchPermissions(
  profileId = selectedPerfilId.value,
  options: { clearBeforeLoad?: boolean; notifyError?: boolean } = {},
): Promise<boolean> {
  const requestSequence = ++permissionFetchSequence
  const { clearBeforeLoad = true, notifyError = true } = options

  if (!profileId) {
    permissions.value = []
    persistedPermissions.value = []
    permissionLoadError.value = ''
    loadingRBAC.value = false
    return true
  }

  loadingRBAC.value = true
  permissionLoadError.value = ''
  if (clearBeforeLoad) {
    permissions.value = []
    persistedPermissions.value = []
  }

  try {
    const { data } = await api.get(`/admin/permissoes/${profileId}`)
    if (requestSequence !== permissionFetchSequence || profileId !== selectedPerfilId.value) return false

    const loadedPermissions = data.map((item: Permission) => ({ ...item }))
    permissions.value = loadedPermissions.map((item: Permission) => ({ ...item }))
    persistedPermissions.value = loadedPermissions
    return true
  } catch (error: any) {
    if (requestSequence !== permissionFetchSequence || profileId !== selectedPerfilId.value) return false

    const message = error.response?.data?.error || 'Erro ao obter matriz de acessos.'
    permissionLoadError.value = notifyError ? message : ''
    if (notifyError) showToast(message, 'error')
    return false
  } finally {
    if (requestSequence === permissionFetchSequence) loadingRBAC.value = false
  }
}

async function alterarPerfilColaborador(usuarioId: string, event: Event) {
  const target = event.target as HTMLSelectElement
  const novoPerfilId = target.value

  updatingUserProfile.value[usuarioId] = true
  try {
    await api.put(`/admin/usuarios/${usuarioId}/perfil`, {
      perfilId: novoPerfilId
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
    showToast(error.response?.data?.error || 'Falha ao atualizar perfil do colaborador.', 'error')
    await fetchUsers()
  } finally {
    updatingUserProfile.value[usuarioId] = false
  }
}

const showEditModal = ref(false)
const selectedUser = ref<User | null>(null)
const formUsuario = ref({
  perfilId: '',
  setorId: ''
})

function abrirEditarUsuario(user: User) {
  selectedUser.value = user
  formUsuario.value = {
    perfilId: user.perfil?.id || '',
    setorId: user.setorId || ''
  }
  showEditModal.value = true
}

async function salvarUsuario() {
  if (!selectedUser.value) return
  
  const id = selectedUser.value.id
  updatingUserProfile.value[id] = true
  try {
    const payload = {
      perfilId: formUsuario.value.perfilId,
      setorId: formUsuario.value.setorId || null
    }
    
    await api.put(`/admin/usuarios/${id}/perfil`, payload)
    
    showToast('Colaborador atualizado com sucesso.')
    showEditModal.value = false
    await fetchUsers()
  } catch (error: any) {
    showToast(error.response?.data?.error || 'Falha ao atualizar colaborador.', 'error')
  } finally {
    if (selectedUser.value && selectedUser.value.id === id) {
      updatingUserProfile.value[id] = false
    }
  }
}

// Matrix helper checking if allowed
function isAllowed(setorId: string | null, acao: string): boolean {
  const perm = permissions.value.find(
    (p) => p.setorId === setorId && p.acao === acao
  )
  return perm ? perm.permitido : false
}

// A matriz é editada localmente e gravada em uma única transação ao salvar.
function permissionKey(permission: Pick<Permission, 'setorId' | 'acao'>) {
  return `${permission.setorId || 'global'}|${permission.acao}`
}

const pendingPermissions = computed(() => permissions.value.filter((permission) => {
  const persisted = persistedPermissions.value.find(item => permissionKey(item) === permissionKey(permission))
  return permission.permitido !== (persisted?.permitido ?? false)
}))

const pendingChanges = computed(() => pendingPermissions.value.map((permission) => {
  const previous = persistedPermissions.value.find(item => permissionKey(item) === permissionKey(permission))
  const screen = screenDefinitions.value.find(item => item.viewPermission === permission.acao || item.editPermission === permission.acao)
  const globalAction = permissionCatalog.value.globalActions.find(item => item.acao === permission.acao)
  const sectorAction = permissionCatalog.value.sectorActions.find(item => item.acao === permission.acao)
  const sectorName = permission.setorId ? sectors.value.find(item => item.id === permission.setorId)?.nome || 'Setor' : null
  const section = screen ? 'Acesso às telas' : globalAction ? 'Ações globais' : 'Permissões por setor'
  const permissionType = screen
    ? screen.editPermission === permission.acao ? 'Editar' : 'Visualizar'
    : globalAction || sectorAction ? (globalAction || sectorAction)!.label : permission.acao
  return {
    key: permissionKey(permission),
    section,
    label: screen?.label || permissionType,
    scope: screen ? permissionType : sectorName,
    before: previous?.permitido ? 'Permitido' : 'Bloqueado',
    after: permission.permitido ? 'Permitido' : 'Bloqueado',
    permitido: permission.permitido,
  }
}))

const pendingChangesByStep = computed<Record<WizardStep, number>>(() => ({
  telas: pendingChanges.value.filter(item => item.section === 'Acesso às telas').length,
  globais: pendingChanges.value.filter(item => item.section === 'Ações globais').length,
  setores: pendingChanges.value.filter(item => item.section === 'Permissões por setor').length,
  revisao: pendingChanges.value.length,
}))

const activeWizardIndex = computed(() => wizardSteps.findIndex(step => step.id === expandedWizardStep.value))

function toggleWizardStep(step: WizardStep) {
  expandedWizardStep.value = expandedWizardStep.value === step ? null : step
}

function moveWizardStep(direction: -1 | 1) {
  const current = Math.max(0, activeWizardIndex.value)
  const next = Math.min(wizardSteps.length - 1, Math.max(0, current + direction))
  expandedWizardStep.value = wizardSteps[next].id
}

function formatChangeCount(count: number) {
  return count === 1 ? '1 mudança' : `${count} mudanças`
}

function togglePermission(setorId: string | null, acao: string) {
  if (savingConfiguration.value) return
  configurationJustSaved.value = false
  const screen = screenDefinitions.value.find(item => item.viewPermission === acao || item.editPermission === acao)
  const nextValue = !isAllowed(setorId, acao)
  const apply = (action: string, permitido: boolean) => {
    const existing = permissions.value.find(item => item.setorId === setorId && item.acao === action)
    if (existing) existing.permitido = permitido
    else permissions.value.push({ perfilId: selectedPerfilId.value, setorId, acao: action, permitido })
  }
  apply(acao, nextValue)
  if (screen?.editPermission === acao && nextValue) apply(screen.viewPermission, true)
  if (screen?.viewPermission === acao && !nextValue && screen.editPermission) apply(screen.editPermission, false)
}

function discardConfiguration() {
  permissions.value = persistedPermissions.value.map(item => ({ ...item }))
  configurationJustSaved.value = false
  expandedWizardStep.value = 'telas'
}

async function saveConfiguration() {
  const profileId = selectedPerfilId.value
  const changesToSave = pendingPermissions.value.map(({ perfilId, setorId, acao, permitido }) => ({ perfilId, setorId, acao, permitido }))
  if (!changesToSave.length || savingConfiguration.value) return

  const savedPermissionsSnapshot = permissions.value.map(item => ({ ...item }))
  savingConfiguration.value = true
  try {
    try {
      await api.put('/admin/permissoes', changesToSave)
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Falha ao salvar configuração do perfil.', 'error')
      return
    }

    const refreshed = await fetchPermissions(profileId, { clearBeforeLoad: false, notifyError: false })
    const notices: string[] = []
    if (!refreshed) {
      if (selectedPerfilId.value === profileId) {
        permissions.value = savedPermissionsSnapshot.map(item => ({ ...item }))
        persistedPermissions.value = savedPermissionsSnapshot.map(item => ({ ...item }))
        configurationJustSaved.value = true
      }
      notices.push('não foi possível recarregar a matriz')
    } else {
      configurationJustSaved.value = true
    }

    if (authStore.user.value?.perfilId === profileId) {
      try {
        await authStore.refreshCurrentUser()
      } catch {
        notices.push('a sessão atual não foi atualizada')
      }
    }

    if (notices.length) {
      showToast(`Permissões salvas, mas ${notices.join(' e ')}.`, 'error')
    } else {
      showToast('Configuração do perfil salva no banco de dados.')
    }
  } finally {
    savingConfiguration.value = false
  }
}

function selectProfile(event: Event) {
  const target = event.target as HTMLSelectElement
  if (pendingPermissions.value.length && !window.confirm('Descartar as alterações não salvas deste perfil?')) {
    target.value = selectedPerfilId.value
    return
  }
  selectedPerfilId.value = target.value
}

async function toggleAudit() {
  showAudit.value = !showAudit.value
  if (showAudit.value) await fetchAudit(true)
}

async function fetchAudit(reset = false) {
  auditLoading.value = true
  auditError.value = ''
  try {
    const offset = reset ? 0 : auditItems.value.length
    const { data } = await api.get('/admin/auditoria/rbac', { params: { offset, limit: 30 } })
    auditItems.value = reset ? data.items : [...auditItems.value, ...data.items]
    auditTotal.value = data.total
  } catch (error: any) {
    auditError.value = error.response?.data?.error || 'Falha ao carregar auditoria.'
  } finally {
    auditLoading.value = false
  }
}

// Helpers
function getActionLabel(action: string): string {
  return [
    ...permissionCatalog.value.globalActions,
    ...permissionCatalog.value.sectorActions,
  ].find((definition) => definition.acao === action)?.label || action
}

const globalActions = computed(() => permissionCatalog.value.globalActions.map(({ acao }) => acao))
const sectorActions = computed(() => permissionCatalog.value.sectorActions.map(({ acao }) => acao))
const screenDefinitions = computed(() => permissionCatalog.value.screens)

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

watch(selectedPerfilId, (profileId) => {
  expandedWizardStep.value = 'telas'
  configurationJustSaved.value = false
  fetchPermissions(profileId)
})

function protectUnsavedDraft(event: BeforeUnloadEvent) {
  if (!pendingPermissions.value.length) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (savingConfiguration.value) {
    showToast('Aguarde o salvamento da configuração antes de sair.', 'error')
    return false
  }
  if (!pendingPermissions.value.length) return true
  return window.confirm('Existem alterações de permissões não salvas. Deseja sair e descartá-las?')
})

onMounted(() => {
  window.addEventListener('beforeunload', protectUnsavedDraft)
  fetchUsers()
  fetchMetadata()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', protectUnsavedDraft)
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
        <div class="audit-control">
          <button type="button" class="btn-edit-user" :aria-expanded="showAudit" @click="toggleAudit">Auditoria de acessos</button>
          <div v-if="showAudit" class="audit-dropdown" role="region" aria-label="Histórico de acessos RBAC">
            <div class="audit-heading">
              <strong>Histórico de alterações</strong>
              <button type="button" class="btn-edit-user" :disabled="auditLoading" @click="fetchAudit(true)">Atualizar</button>
            </div>
            <p v-if="auditError" role="alert">{{ auditError }}</p>
            <p v-else-if="auditLoading && !auditItems.length">Carregando auditoria...</p>
            <p v-else-if="!auditItems.length">Nenhuma alteração registrada.</p>
            <div v-for="entry in auditItems" :key="entry.id" class="audit-entry">
              <strong>{{ entry.acao.replaceAll('_', ' ') }}</strong>
              <small>{{ new Date(entry.createdAt).toLocaleString('pt-BR') }} · {{ entry.usuario?.nomeCompleto || 'Sistema' }}</small>
              <details>
                <summary>Ver dados alterados</summary>
                <pre>Antes: {{ JSON.stringify(entry.dadosAnteriores, null, 2) }}
Depois: {{ JSON.stringify(entry.dadosNovos, null, 2) }}</pre>
              </details>
            </div>
            <button v-if="auditItems.length < auditTotal" type="button" class="btn-edit-user" :disabled="auditLoading" @click="fetchAudit(false)">Carregar mais</button>
          </div>
        </div>
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
                    <th>Setor Lotação</th>
                    <th>Planta Fabril</th>
                    <th class="text-center">Status</th>
                    <th class="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="usersLoadError">
                    <td colspan="8" class="table-empty" role="alert">{{ usersLoadError }}</td>
                  </tr>
                  <tr v-for="user in filteredUsers" v-if="!usersLoadError" :key="user.id">
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
                          :disabled="updatingUserProfile[user.id] || isContaAdminAutomacao(user.usuario)"
                        >
                          <option v-for="prof in profiles.filter(item => item.ativo && (item.nome !== 'ADMIN_AUTOMACAO' || user.perfil?.nome === item.nome))" :key="prof.id" :value="prof.id">
                            {{ prof.nome }}
                          </option>
                        </select>
                        <RefreshCw v-if="updatingUserProfile[user.id]" :size="12" class="spin-anim select-spinner" aria-hidden="true" />
                      </div>
                    </td>
                    <td>
                      <span class="text-muted">{{ user.setor?.nome || 'Geral/Global' }}</span>
                    </td>
                    <td class="text-muted">{{ user.planta?.nome || '-' }}</td>
                    <td class="text-center">
                      <span :class="['status-pill', user.ativo ? 'status-pill--active' : 'status-pill--inactive']">
                        <CheckCircle2 v-if="user.ativo" :size="12" aria-hidden="true" />
                        <XCircle v-else :size="12" aria-hidden="true" />
                        <span>{{ user.ativo ? 'Ativo' : 'Inativo' }}</span>
                      </span>
                    </td>
                    <td class="text-center">
                      <button
                        type="button"
                        class="btn-edit-user"
                        @click="abrirEditarUsuario(user)"
                        :aria-label="`Editar colaborador ${user.nomeCompleto}`"
                      >
                        <span>Editar</span>
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!usersLoadError && filteredUsers.length === 0">
                    <td colspan="8" class="table-empty">
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
            <section class="profile-config-card" aria-label="Perfil em configuração">
              <div class="profile-choice">
                <label for="perfil-select" class="dropdown-label">Perfil de usuário</label>
                <div class="select-wrapper">
                  <select id="perfil-select" :value="selectedPerfilId" @change="selectProfile" class="perfil-select" :disabled="loadingRBAC || savingConfiguration">
                    <option v-for="prof in profiles.filter(item => item.ativo)" :key="prof.id" :value="prof.id">
                      {{ prof.nome }} — {{ prof.descricao || 'Sem descrição' }}
                    </option>
                  </select>
                </div>
                <p v-if="profiles.find(profile => profile.id === selectedPerfilId)?.descricao" class="profile-current-description">
                  {{ profiles.find(profile => profile.id === selectedPerfilId)?.descricao }}
                </p>
                <p v-if="metadataLoadError" class="field-hint-text" role="alert">{{ metadataLoadError }}</p>
              </div>
              <div class="profile-config-actions">
                <button
                  type="button"
                  class="btn-edit-user"
                  :aria-expanded="showProfileManager"
                  aria-controls="rbac-profile-manager"
                  @click="showProfileManager = !showProfileManager"
                >
                  {{ showProfileManager ? 'Fechar perfis' : `Gerenciar perfis (${profiles.length})` }}
                  <ChevronDown :size="15" :class="{ 'chevron-open': showProfileManager }" aria-hidden="true" />
                </button>
                <button type="button" class="btn-save" @click="abrirNovoPerfil" :disabled="savingConfiguration">Novo perfil</button>
              </div>
            </section>

            <section id="rbac-profile-manager" v-show="showProfileManager" class="profile-manager-panel" aria-label="Gerenciar perfis">
              <div v-for="profile in profiles" :key="profile.id" class="profile-row">
                <div class="profile-row-info">
                  <strong>{{ profile.nome }}</strong>
                  <span>{{ profile.descricao || 'Sem descrição' }}</span>
                </div>
                <span :class="['status-pill', profile.ativo ? 'status-pill--active' : 'status-pill--inactive']">
                  {{ profile.ativo ? 'Ativo' : 'Inativo' }}
                </span>
                <button type="button" class="btn-edit-user" @click="editarPerfil(profile)" :disabled="savingConfiguration">Editar</button>
                <button
                  type="button"
                  class="btn-edit-user"
                  :disabled="savingConfiguration || (isPerfilSistema(profile.nome) && profile.ativo)"
                  @click="alternarStatusPerfil(profile)"
                >
                  {{ profile.ativo ? 'Desativar' : 'Reativar' }}
                </button>
              </div>
              <p v-if="profiles.length === 0" class="field-hint-text">Nenhum perfil cadastrado.</p>
            </section>

            <div v-if="loadingRBAC" class="loading-state card-loading">
              <RefreshCw :size="32" class="spin-anim loading-spinner" />
              <span>Carregando permissões do perfil...</span>
            </div>
            <div v-else-if="permissionLoadError" class="field-hint-text" role="alert">
              {{ permissionLoadError }}
            </div>
            <div v-else class="permission-wizard">
              <div class="wizard-overview">
                <div class="wizard-overview-copy">
                  <span class="wizard-eyebrow">Configuração de acesso</span>
                  <strong>{{ expandedWizardStep ? `Etapa ${activeWizardIndex + 1} de ${wizardSteps.length}` : 'Escolha uma etapa' }}</strong>
                  <span>As mudanças ficam em rascunho até a confirmação final.</span>
                </div>
                <div class="wizard-progress" role="progressbar" aria-label="Progresso da configuração" :aria-valuenow="expandedWizardStep ? activeWizardIndex + 1 : 0" aria-valuemin="0" :aria-valuemax="wizardSteps.length">
                  <span :style="{ width: `${expandedWizardStep ? ((activeWizardIndex + 1) / wizardSteps.length) * 100 : 0}%` }"></span>
                </div>
              </div>

              <section
                v-for="(step, index) in wizardSteps"
                :key="step.id"
                class="wizard-step"
                :class="{ 'wizard-step--active': expandedWizardStep === step.id, 'wizard-step--review': step.id === 'revisao' }"
              >
                <h3 class="wizard-step-heading">
                  <button
                    :id="`rbac-step-heading-${step.id}`"
                    type="button"
                    class="wizard-step-trigger"
                    :aria-expanded="expandedWizardStep === step.id"
                    :aria-controls="`rbac-step-panel-${step.id}`"
                    @click="toggleWizardStep(step.id)"
                  >
                    <span class="wizard-step-number">{{ String(index + 1).padStart(2, '0') }}</span>
                    <span class="wizard-step-title">
                      <strong>{{ step.title }}</strong>
                      <small>{{ step.description }}</small>
                    </span>
                    <span class="wizard-step-count" :class="{ 'wizard-step-count--pending': pendingChangesByStep[step.id] > 0 }">
                      {{ pendingChangesByStep[step.id] ? formatChangeCount(pendingChangesByStep[step.id]) : 'Sem mudanças' }}
                    </span>
                    <ChevronDown :size="18" class="wizard-chevron" :class="{ 'chevron-open': expandedWizardStep === step.id }" aria-hidden="true" />
                  </button>
                </h3>

                <div
                  :id="`rbac-step-panel-${step.id}`"
                  v-show="expandedWizardStep === step.id"
                  class="wizard-step-panel"
                  role="region"
                  :aria-labelledby="`rbac-step-heading-${step.id}`"
                >
                  <template v-if="step.id === 'telas'">
                    <div class="step-panel-intro">
                      <span class="step-panel-kicker">Etapa 1</span>
                      <p>Escolha o que este perfil pode consultar e editar em cada tela.</p>
                    </div>
                    <div class="table-outer shadow-matrix">
                      <table class="matrix-table">
                        <thead>
                          <tr>
                            <th class="sticky-col">Tela</th>
                            <th class="text-center">Visualizar</th>
                            <th class="text-center">Editar</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="screen in screenDefinitions" :key="screen.viewPermission">
                            <td class="sticky-col sector-name-cell">
                              <div class="sector-meta">
                                <span class="sector-title-name">{{ screen.label }}</span>
                                <code class="action-header-code">{{ screen.routePath }}</code>
                              </div>
                            </td>
                            <td class="text-center">
                              <button
                                type="button"
                                class="matrix-toggle"
                                :class="{ 'matrix-toggle--active': isAllowed(null, screen.viewPermission) }"
                                :disabled="savingConfiguration"
                                @click="togglePermission(null, screen.viewPermission)"
                                :aria-label="`Permitir visualizar ${screen.label}`"
                                :aria-pressed="isAllowed(null, screen.viewPermission)"
                              >
                                <span class="matrix-toggle-thumb"></span>
                              </button>
                            </td>
                            <td class="text-center">
                              <button
                                v-if="screen.editPermission"
                                type="button"
                                class="matrix-toggle"
                                :class="{ 'matrix-toggle--active': isAllowed(null, screen.editPermission) }"
                                :disabled="savingConfiguration"
                                @click="togglePermission(null, screen.editPermission)"
                                :aria-label="`Permitir edição em ${screen.label}`"
                                :aria-pressed="isAllowed(null, screen.editPermission)"
                              >
                                <span class="matrix-toggle-thumb"></span>
                              </button>
                              <span v-else class="text-muted">Somente leitura</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </template>

                  <template v-else-if="step.id === 'globais'">
                    <div class="step-panel-intro">
                      <span class="step-panel-kicker">Etapa 2</span>
                      <p>Essas ações não ficam vinculadas a um setor específico.</p>
                    </div>
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
                            :disabled="savingConfiguration"
                            @click="togglePermission(null, action)"
                            :aria-label="`Permitir ação global ${getActionLabel(action)}`"
                            :aria-pressed="isAllowed(null, action)"
                          >
                            <span class="matrix-toggle-thumb"></span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="step.id === 'setores'">
                    <div class="step-panel-intro">
                      <span class="step-panel-kicker">Etapa 3</span>
                      <p>Os setores ativos vêm do cadastro do sistema. Cada permissão vale somente para a linha correspondente.</p>
                    </div>
                    <div v-if="sectors.length" class="table-outer shadow-matrix">
                      <table class="matrix-table sector-matrix-table">
                        <thead>
                          <tr>
                            <th class="sticky-col">Setor de produção</th>
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
                                :disabled="savingConfiguration"
                                @click="togglePermission(sector.id, action)"
                                :aria-label="`Permitir ação ${getActionLabel(action)} no setor ${sector.nome}`"
                                :aria-pressed="isAllowed(sector.id, action)"
                              >
                                <span class="matrix-toggle-thumb"></span>
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else class="wizard-empty-state">
                      <strong>Nenhum setor ativo disponível</strong>
                      <span>Cadastre ou ative setores para configurar permissões operacionais.</span>
                    </div>
                  </template>

                  <template v-else>
                    <div class="step-panel-intro review-intro">
                      <span class="step-panel-kicker">Etapa 4</span>
                      <p>Confira cada mudança. Nada será gravado até você confirmar abaixo.</p>
                    </div>
                    <div v-if="configurationJustSaved && !pendingChanges.length" class="review-success" role="status">
                      <CheckCircle2 :size="18" aria-hidden="true" />
                      <span>Configuração salva. Não há mudanças pendentes.</span>
                    </div>
                    <div v-else-if="!pendingChanges.length" class="wizard-empty-state">
                      <strong>Nenhuma mudança para salvar</strong>
                      <span>Volte a uma etapa e altere as permissões que deseja configurar.</span>
                    </div>
                    <div v-else class="review-list" aria-label="Mudanças pendentes">
                      <article v-for="change in pendingChanges" :key="change.key" class="review-change">
                        <div class="review-change-info">
                          <span class="review-category">{{ change.section }}</span>
                          <strong>{{ change.label }}</strong>
                          <small v-if="change.scope">{{ change.scope }}</small>
                        </div>
                        <div class="review-diff">
                          <span class="review-before">{{ change.before }}</span>
                          <ArrowRight :size="15" aria-hidden="true" />
                          <span :class="['review-after', change.permitido ? 'review-after--allowed' : 'review-after--blocked']">{{ change.after }}</span>
                        </div>
                      </article>
                    </div>
                    <div class="wizard-review-actions">
                      <button type="button" class="btn-edit-user" :disabled="!pendingChanges.length || savingConfiguration" @click="discardConfiguration">Descartar rascunho</button>
                      <button type="button" class="btn-save" :disabled="!pendingChanges.length || savingConfiguration" @click="saveConfiguration">
                        {{ savingConfiguration ? 'Salvando...' : 'Salvar configuração' }}
                      </button>
                    </div>
                  </template>

                  <div class="wizard-navigation">
                    <button v-if="index > 0" type="button" class="wizard-back" @click="moveWizardStep(-1)">Voltar</button>
                    <span v-else class="wizard-navigation-note">{{ pendingChanges.length ? `${formatChangeCount(pendingChanges.length)} em rascunho` : 'Nenhuma mudança em rascunho' }}</span>
                    <button v-if="index < wizardSteps.length - 1" type="button" class="btn-save wizard-continue" @click="moveWizardStep(1)">
                      Continuar <ArrowRight :size="15" aria-hidden="true" />
                    </button>
                    <span v-else class="wizard-navigation-note wizard-navigation-note--end">
                      {{ pendingChanges.length ? `${formatChangeCount(pendingChanges.length)} aguardando confirmação` : 'Revisão concluída' }}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- MODAL DE EDICAO DE COLABORADOR -->
    <Transition name="fade-slide">
      <div v-if="showEditModal && selectedUser" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-window">
          <header class="modal-header">
            <h2 id="modal-title" class="modal-title-text">Editar Colaborador</h2>
            <button type="button" class="btn-close-modal" @click="showEditModal = false" aria-label="Fechar modal">
              &times;
            </button>
          </header>
          
          <main class="modal-body-content">
            <div class="modal-field-group">
              <span class="modal-field-label">Nome Completo</span>
              <strong class="modal-field-val">{{ selectedUser.nomeCompleto }}</strong>
            </div>
            
            <div class="modal-field-group">
              <span class="modal-field-label">Usuario</span>
              <code class="modal-field-code">{{ selectedUser.usuario }}</code>
            </div>
            
            <div class="modal-field-group">
              <span class="modal-field-label">Cargo</span>
              <span class="modal-field-val text-muted">{{ selectedUser.cargo }}</span>
            </div>

            <form @submit.prevent="salvarUsuario" class="modal-form">
              <div class="form-input-group">
                <label for="modal-perfil" class="input-label-tag">Perfil de Acesso</label>
                <div class="select-wrapper">
                  <select id="modal-perfil" v-model="formUsuario.perfilId" class="modal-select-input" required>
                    <option v-for="prof in profiles.filter(item => item.ativo && (item.nome !== 'ADMIN_AUTOMACAO' || isContaAdminAutomacao(selectedUser?.usuario || '')))" :key="prof.id" :value="prof.id">
                      {{ prof.nome }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-input-group">
                <label for="modal-setor" class="input-label-tag">Setor de Lotacao</label>
                <div class="select-wrapper">
                  <select id="modal-setor" v-model="formUsuario.setorId" class="modal-select-input">
                    <option value="">Geral / Sem Setor Mapeado</option>
                    <option v-for="sec in sectors" :key="sec.id" :value="sec.id">
                      {{ sec.nome }}
                    </option>
                  </select>
                </div>
                <p class="field-hint-text">Necessario para controle de bipagem e permissoes nos setores do chao de fabrica.</p>
              </div>

              <div class="modal-actions-row">
                <button type="button" class="btn-cancel" @click="showEditModal = false">
                  Cancelar
                </button>
                <button type="submit" class="btn-save" :disabled="updatingUserProfile[selectedUser.id]">
                  <RefreshCw v-if="updatingUserProfile[selectedUser.id]" :size="14" class="spin-anim" aria-hidden="true" />
                  <span>Salvar Alteracoes</span>
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </Transition>

    <Transition name="fade-slide">
      <div v-if="showPerfilModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="perfil-modal-title">
        <div class="modal-window">
          <header class="modal-header">
            <h2 id="perfil-modal-title" class="modal-title-text">{{ editingPerfilId ? 'Editar perfil' : 'Novo perfil de acesso' }}</h2>
            <button type="button" class="btn-close-modal" @click="showPerfilModal = false" aria-label="Fechar modal">&times;</button>
          </header>
          <form class="modal-body-content" @submit.prevent="salvarPerfil">
            <div class="form-input-group">
              <label for="perfil-nome" class="input-label-tag">Nome do perfil</label>
                  <input
                    id="perfil-nome"
                    v-model="formPerfil.nome"
                    class="modal-select-input"
                    maxlength="50"
                    :disabled="!!editingPerfilId && isPerfilSistema(formPerfil.nome)"
                    required
                  />
            </div>
            <div class="form-input-group">
              <label for="perfil-descricao" class="input-label-tag">Descrição</label>
              <textarea id="perfil-descricao" v-model="formPerfil.descricao" class="modal-select-input" maxlength="500" rows="3"></textarea>
            </div>
            <div class="modal-actions-row">
              <button type="button" class="btn-cancel" @click="showPerfilModal = false">Cancelar</button>
              <button type="submit" class="btn-save" :disabled="savingPerfil">
                {{ savingPerfil ? 'Salvando…' : 'Salvar perfil' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

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
.audit-control { position: relative; }
.audit-dropdown { position: absolute; z-index: 30; right: 0; top: calc(100% + 8px); width: min(430px, calc(100vw - 2rem)); max-height: min(70vh, 560px); overflow: auto; padding: 16px; background: white; border: 1px solid #dce5f0; border-radius: 12px; box-shadow: 0 12px 30px #11224426; }
.audit-heading, .profile-config-actions, .wizard-navigation, .wizard-review-actions { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.audit-entry { border-top: 1px solid #e4e9f2; padding: 12px 0; display: grid; gap: 4px; }
.audit-entry small { color: #52627b; }
.audit-entry pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
/* ═══════════════════════════════════════
   ROOT CONTAINER
═══════════════════════════════════════ */
.rbac-container {
  --rbac-primary: #1e40af;
  --rbac-ink: #0f172a;
  --rbac-muted: #64748b;
  --rbac-line: #dbe4ef;
  --rbac-surface: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  background: #fff;
}

.profile-row-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.profile-row-info span {
  overflow: hidden;
  color: #64748b;
  font-size: 0.75rem;
  text-overflow: ellipsis;
}

@media (max-width: 640px) {
  .profile-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .profile-row-info {
    flex-basis: 100%;
  }
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
  gap: 1rem;
}

.profile-config-card {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  align-items: center;
  gap: 1.5rem;
  padding: 1.125rem 1.25rem;
  background: var(--rbac-surface);
  border: 1px solid var(--rbac-line);
  border-radius: 0.75rem;
  box-shadow: 0 2px 8px rgb(15 23 42 / 4%);
}

.profile-choice {
  display: grid;
  gap: 0.4rem;
  max-width: 42rem;
}

.profile-current-description {
  margin: 0;
  color: var(--rbac-muted);
  font-size: 0.78rem;
}

.profile-config-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.profile-config-actions .btn-edit-user,
.profile-config-actions .btn-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.5rem;
  white-space: nowrap;
}

.chevron-open {
  transform: rotate(180deg);
}

.profile-config-actions svg,
.wizard-chevron {
  transition: transform 160ms ease;
}

.profile-manager-panel {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid var(--rbac-line);
  border-radius: 0.75rem;
}

.permission-wizard {
  display: grid;
  gap: 0.75rem;
}

.wizard-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 240px);
  align-items: center;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}

.wizard-overview-copy {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.7rem;
}

.wizard-eyebrow,
.step-panel-kicker {
  color: var(--rbac-primary);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wizard-overview-copy strong {
  color: var(--rbac-ink);
  font-size: 0.9rem;
}

.wizard-overview-copy > span:last-child {
  flex-basis: 100%;
  color: var(--rbac-muted);
  font-size: 0.76rem;
}

.wizard-progress {
  height: 0.4rem;
  overflow: hidden;
  background: #e7edf6;
  border-radius: 999px;
}

.wizard-progress > span {
  display: block;
  height: 100%;
  background: var(--rbac-primary);
  border-radius: inherit;
  transition: width 180ms ease;
}

.wizard-step {
  overflow: hidden;
  background: var(--rbac-surface);
  border: 1px solid var(--rbac-line);
  border-radius: 0.75rem;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.wizard-step--active {
  border-color: #a9bee9;
  box-shadow: 0 4px 14px rgb(30 64 175 / 6%);
}

.wizard-step-heading {
  margin: 0;
}

.wizard-step-trigger {
  display: grid;
  width: 100%;
  grid-template-columns: 2.35rem minmax(0, 1fr) auto 1.25rem;
  align-items: center;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  color: var(--rbac-ink);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.wizard-step-trigger:hover {
  background: #f8faff;
}

.wizard-step-trigger:focus-visible,
.wizard-back:focus-visible {
  outline: 3px solid rgb(30 64 175 / 32%);
  outline-offset: -3px;
}

.wizard-step-number {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 800;
  background: #eef2f8;
  border-radius: 0.6rem;
}

.wizard-step--active .wizard-step-number {
  color: white;
  background: var(--rbac-primary);
}

.wizard-step-title {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.wizard-step-title strong {
  font-size: 0.9rem;
}

.wizard-step-title small {
  overflow: hidden;
  color: var(--rbac-muted);
  font-size: 0.74rem;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wizard-step-count {
  padding: 0.3rem 0.55rem;
  color: #52627b;
  font-size: 0.68rem;
  font-weight: 700;
  background: #f1f5f9;
  border-radius: 999px;
  white-space: nowrap;
}

.wizard-step-count--pending {
  color: #1e3a8a;
  background: #eaf1ff;
}

.wizard-chevron {
  color: #64748b;
}

.wizard-step-panel {
  padding: 0.15rem 1rem 1rem;
  border-top: 1px solid #edf1f6;
}

.step-panel-intro {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  padding: 0.9rem 0;
}

.step-panel-intro p {
  margin: 0;
  color: #52627b;
  font-size: 0.8rem;
  line-height: 1.45;
}

.wizard-navigation {
  min-height: 2.75rem;
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid #edf1f6;
}

.wizard-navigation-note {
  color: var(--rbac-muted);
  font-size: 0.75rem;
}

.wizard-navigation-note--end {
  margin-left: auto;
}

.wizard-back,
.wizard-continue {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.5rem;
}

.wizard-back {
  padding: 0.5rem 0.75rem;
  color: #334155;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  background: white;
  border: 1px solid var(--rbac-line);
  border-radius: 0.5rem;
  cursor: pointer;
}

.wizard-continue {
  margin-left: auto;
}

.wizard-empty-state {
  display: grid;
  gap: 0.25rem;
  padding: 1.25rem;
  color: #475569;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 0.65rem;
}

.wizard-empty-state strong {
  color: var(--rbac-ink);
  font-size: 0.85rem;
}

.wizard-empty-state span {
  font-size: 0.76rem;
}

.review-list {
  display: grid;
  border-top: 1px solid #e5ebf3;
}

.review-change {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, auto);
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid #e5ebf3;
}

.review-change-info {
  display: grid;
  gap: 0.15rem;
}

.review-category {
  color: var(--rbac-primary);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.review-change-info strong {
  color: var(--rbac-ink);
  font-size: 0.82rem;
}

.review-change-info small {
  color: var(--rbac-muted);
  font-size: 0.72rem;
}

.review-diff {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  color: #64748b;
  font-size: 0.75rem;
}

.review-before,
.review-after {
  padding: 0.3rem 0.5rem;
  border-radius: 0.4rem;
  white-space: nowrap;
}

.review-before {
  color: #475569;
  background: #f1f5f9;
}

.review-after--allowed {
  color: #166534;
  font-weight: 700;
  background: #f0fdf4;
}

.review-after--blocked {
  color: #991b1b;
  font-weight: 700;
  background: #fef2f2;
}

.review-success {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  color: #166534;
  font-size: 0.82rem;
  font-weight: 600;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.6rem;
}

.wizard-review-actions {
  justify-content: flex-end;
  padding-top: 1rem;
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

.sector-matrix-table {
  min-width: 48rem;
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

@media (max-width: 760px) {
  .profile-config-card {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.85rem;
  }

  .profile-config-actions {
    justify-content: flex-start;
  }

  .wizard-overview {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.65rem;
  }

  .wizard-step-trigger {
    grid-template-columns: 2.25rem minmax(0, 1fr) 1.25rem;
    gap: 0.6rem;
    padding: 0.75rem;
  }

  .wizard-step-number { grid-column: 1; grid-row: 1; }
  .wizard-step-title { grid-column: 2; grid-row: 1; }
  .wizard-step-title small { white-space: normal; }
  .wizard-step-count { grid-column: 2; grid-row: 2; justify-self: start; }
  .wizard-chevron { grid-column: 3; grid-row: 1 / span 2; }

  .wizard-step-panel { padding: 0.1rem 0.75rem 0.75rem; }

  .step-panel-intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }

  .review-change {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
  }

  .review-diff { justify-content: flex-start; }

  .wizard-review-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wizard-progress > span,
  .wizard-step,
  .profile-config-actions svg,
  .wizard-chevron {
    transition: none;
  }
}
/* ═══════════════════════════════════════
   BOTOES E MODAL DE COLABORADOR
   Sleek Industrial Theme (Sem Emojis)
═══════════════════════════════════════ */
.btn-edit-user {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-edit-user:hover {
  background: #cbd5e1;
  color: #0f172a;
}

/* Modal Overlay & window styling */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-window {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  width: 100%;
  max-width: 28rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
}

.modal-title-text {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}

.btn-close-modal {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  font-weight: 300;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
}

.btn-close-modal:hover {
  color: #0f172a;
}

.modal-body-content {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-field-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.modal-field-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.modal-field-val {
  font-size: 0.875rem;
  color: #0f172a;
}

.modal-field-code {
  font-family: monospace;
  font-weight: 600;
  background: #f1f5f9;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  color: #475569;
  align-self: flex-start;
}

/* Modal Form control */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.5rem;
  border-top: 1px dashed #e2e8f0;
  padding-top: 1rem;
}

.form-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.input-label-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.modal-select-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0f172a;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.375rem;
  outline: none;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.15s;
}

.modal-select-input:focus {
  border-color: #1e40af;
}

.field-hint-text {
  font-size: 0.6875rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}

.modal-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  color: #475569;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel:hover {
  background: #f8fafc;
  color: #0f172a;
}

.btn-save {
  background: #0f172a;
  border: 1px solid #0f172a;
  color: #ffffff;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s ease;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
