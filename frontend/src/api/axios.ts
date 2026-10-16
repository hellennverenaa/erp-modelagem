import axios, { type InternalAxiosRequestConfig } from 'axios'

// O gateway publica o ERP sob este prefixo e remove-o antes do encaminhamento.
const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/erp-modelagem'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export function getApiOrigin(): string {
  try {
    return new URL(apiBaseUrl, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

export function getApiSocketPath(): string {
  try {
    const prefix = new URL(apiBaseUrl, window.location.origin).pathname.replace(/\/+$/, '')
    return `${prefix}/socket.io`
  } catch {
    return '/api/erp-modelagem/socket.io'
  }
}

// Tokens temporários antigos não são JWTs e devem ser removidos para evitar
// que a aplicação continue enviando Bearer dev-login-bypass-token.
if (localStorage.getItem('erp_token') === 'dev-login-bypass-token') {
  localStorage.removeItem('erp_token')
  localStorage.removeItem('token')
  localStorage.removeItem('jwt_token')
  localStorage.removeItem('erp_user')
}

function getStoredToken(): string | null {
  return (
    localStorage.getItem('erp_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('jwt_token')
  )
}

type RetryableRequestConfig = InternalAxiosRequestConfig & { _authRetried?: boolean }

let refreshRequest: Promise<string> | null = null
let authSessionVersion = 0

const invalidSessionCodes = new Set([
  'AUTH_REFRESH_REJECTED',
  'AUTH_TOKEN_REQUIRED',
  'AUTH_IDENTIFIER_INVALID',
  'AUTH_USER_NOT_FOUND',
  'RBAC_UNAUTHENTICATED',
  'AUTH_UNAUTHENTICATED',
  'UNAUTHENTICATED',
  'AUTH_TOKEN_INVALID',
  'AUTH_USER_INACTIVE',
  'AUTH_PROFILE_INACTIVE',
])

export function isAuthSessionRejected(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false

  const status = error.response?.status
  const code = error.response?.data?.code
  if (typeof code !== 'string' || !invalidSessionCodes.has(code)) return false

  return status === 401 || status === 403
}

export function isTransientApiFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.code === 'ERR_CANCELED') return false

  const status = error.response?.status
  return status === undefined || status === 408 || status === 429 || status >= 500
}

export function storeAccessToken(token: string): void {
  localStorage.setItem('erp_token', token)
  localStorage.removeItem('token')
  localStorage.removeItem('jwt_token')
  window.dispatchEvent(new CustomEvent('erp:auth-token-refreshed', { detail: token }))
}

export function clearStoredAuth(): void {
  authSessionVersion += 1
  localStorage.removeItem('erp_token')
  localStorage.removeItem('token')
  localStorage.removeItem('jwt_token')
  localStorage.removeItem('erp_user')
  window.dispatchEvent(new Event('erp:auth-session-ended'))
}

export function expireAuthSession(): void {
  clearStoredAuth()
  if (window.location.pathname !== '/') window.location.href = '/'
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshRequest) {
    const requestSessionVersion = authSessionVersion
    refreshRequest = api
      .post<{ token?: string }>('/auth/refresh')
      .then(({ data }) => {
        if (typeof data.token !== 'string' || !data.token) {
          throw new Error('O serviço de autenticação não retornou um novo token.')
        }
        if (requestSessionVersion !== authSessionVersion) {
          throw new Error('A sessão foi encerrada durante a renovação.')
        }
        storeAccessToken(data.token)
        return data.token
      })
      .finally(() => {
        refreshRequest = null
      })
  }

  return refreshRequest
}

export async function revokeRemoteSession(): Promise<void> {
  if (refreshRequest) await refreshRequest.catch(() => undefined)
  await api.post('/auth/logout')
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config as RetryableRequestConfig | undefined
    const isAuthenticationRequest = /\/auth\/(login|refresh|logout)(?:\/|$)/.test(originalRequest?.url || '')
    const isExpiredToken = err.response?.status === 401 && err.response.data?.code === 'AUTH_TOKEN_EXPIRED'

    if (!isAuthenticationRequest) {
      if (isExpiredToken && originalRequest && !originalRequest._authRetried) {
        originalRequest._authRetried = true
        try {
          const token = await refreshAccessToken()
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        } catch (refreshError) {
          if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) {
            expireAuthSession()
          }
          return Promise.reject(refreshError)
        }
      }

      if (isExpiredToken || isAuthSessionRejected(err)) expireAuthSession()
    }
    return Promise.reject(err)
  }
)

export default api
