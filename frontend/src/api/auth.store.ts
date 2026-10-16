import api, {
  clearStoredAuth,
  isTransientApiFailure,
  revokeRemoteSession,
  storeAccessToken,
} from './axios'
import axios from 'axios'
import { ref, computed } from 'vue'

// Interfaces
export interface UsuarioLogado {
  id: string
  nomeCompleto: string
  usuario: string
  perfilId?: string
  perfilNome?: string | null
  permissoes?: Record<string, boolean>
  podeInterromperSla?: boolean
  setorId?: string | null
  plantaId?: string | null
}

const token = ref<string | null>(localStorage.getItem('erp_token'))
const userRaw = localStorage.getItem('erp_user')
const user = ref<UsuarioLogado | null>(userRaw ? JSON.parse(userRaw) : null)
let retrySessionEndpointAfter = 0
const sessionValidationIntervalMs = 30_000
const transientRetryDelayMs = 10_000

window.addEventListener('erp:auth-token-refreshed', (event) => {
  const refreshedToken = (event as CustomEvent<string>).detail
  if (refreshedToken) {
    token.value = refreshedToken
    retrySessionEndpointAfter = Date.now() + sessionValidationIntervalMs
  }
})

window.addEventListener('erp:auth-session-ended', () => {
  retrySessionEndpointAfter = 0
  token.value = null
  user.value = null
})

const contasAdminAutomacao = new Set([
  'hellen.magalhaes',
  'jose.falcao',
  'leone.santana',
])

const isAdminAutomacao = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.trim().toUpperCase()
  const usuario = user.value.usuario?.trim().toLowerCase()
  return perfil === 'ADMIN_AUTOMACAO' && !!usuario && contasAdminAutomacao.has(usuario)
})

const podeInterromperSla = computed(() =>
  isAdminAutomacao.value || user.value?.podeInterromperSla === true,
)

// Avaliador de permissões dinâmicas (se tiver permissão global ou específica para a ação)
function hasPermission(acao: string): boolean {
  if (!user.value) return false
  return user.value.permissoes?.[acao] === true
}

async function refreshCurrentUser(): Promise<void> {
  if (!token.value) return
  if (user.value && Date.now() < retrySessionEndpointAfter) return

  try {
    const { data } = await api.get<UsuarioLogado>('/auth/me')
    user.value = data
    localStorage.setItem('erp_user', JSON.stringify(data))
    retrySessionEndpointAfter = Date.now() + sessionValidationIntervalMs
  } catch (error) {
    // Durante a atualização do backend, a versão anterior ainda não expõe /auth/me.
    // A sessão veio do login pelo gateway; o backend continua validando cada API.
    if (axios.isAxiosError(error) && error.response?.status === 404 && user.value) {
      retrySessionEndpointAfter = Date.now() + sessionValidationIntervalMs
      return
    }

    if (user.value && isTransientApiFailure(error)) {
      retrySessionEndpointAfter = Date.now() + transientRetryDelayMs
      return
    }
    throw error
  }
}

function login(newToken: string, userData: UsuarioLogado) {
  retrySessionEndpointAfter = 0
  token.value = newToken
  user.value = userData
  storeAccessToken(newToken)
  localStorage.setItem('erp_user', JSON.stringify(userData))
}

function logout() {
  retrySessionEndpointAfter = 0
  void revokeRemoteSession().catch(() => undefined)
  clearStoredAuth()
}

export const authStore = {
  token,
  user,
  isAdminAutomacao,
  podeInterromperSla,
  hasPermission,
  refreshCurrentUser,
  login,
  logout
}
