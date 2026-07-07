import { ref, computed } from 'vue'

// Interfaces
export interface UsuarioLogado {
  id: string
  nomeCompleto: string
  usuario: string
  perfilNome?: string
  setorId?: string | null
  plantaId?: string | null
}

const token = ref<string | null>(localStorage.getItem('erp_token'))
const userRaw = localStorage.getItem('erp_user')
const user = ref<UsuarioLogado | null>(userRaw ? JSON.parse(userRaw) : null)

const isAuthenticated = computed(() => !!token.value)

// Getter reativo estrito isAdmin que verifica se o perfil é ADMIN
const isAdmin = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return perfil === 'ADMIN'
})

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
  login,
  logout
}
