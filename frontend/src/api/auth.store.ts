import { ref, computed } from 'vue'

// Interfaces
export interface UsuarioLogado {
  id: string
  nomeCompleto: string
  usuario: string
  perfilNome?: string | null
  permissoes?: Record<string, boolean>
  setorId?: string | null
  plantaId?: string | null
}

const token = ref<string | null>(localStorage.getItem('erp_token'))
const userRaw = localStorage.getItem('erp_user')
const user = ref<UsuarioLogado | null>(userRaw ? JSON.parse(userRaw) : null)

const isAuthenticated = computed(() => !!token.value)

// Getters reativos rigorosos para os perfis da seção de permissões
const isAdmin = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return perfil === 'ADMIN'
})

const isModelista = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return perfil === 'MODELISTA'
})

const isGerente = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return perfil === 'GERENTE'
})

const isOperador = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return perfil === 'OPERADOR'
})

// Avaliador de permissões dinâmicas (se tiver permissão global ou específica para a ação)
function hasPermission(acao: string): boolean {
  if (!user.value) return false
  if (isAdmin.value) return true // ADMIN tem permissão para tudo
  return !!user.value.permissoes?.[acao]
}

function login(newToken: string, userData: UsuarioLogado) {
  token.value = newToken
  user.value = userData
  localStorage.setItem('erp_token', newToken)
  localStorage.setItem('erp_user', JSON.stringify(userData))
}

function logout() {
  token.value = null
  user.value = null
  localStorage.removeItem('erp_token')
  localStorage.removeItem('erp_user')
}

export const authStore = {
  token,
  user,
  isAuthenticated,
  isAdmin,
  isModelista,
  isGerente,
  isOperador,
  hasPermission,
  login,
  logout
}
