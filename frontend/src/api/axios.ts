import axios from 'axios'

// O gateway publica o ERP sob este prefixo e remove-o antes do encaminhamento.
const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/erp-modelagem'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
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
    const originalRequest = err.config
    const isAuthenticationRequest = /\/auth\/(login|refresh)(?:\/|$)/.test(originalRequest?.url || '')

    if (err.response?.status === 401 && !isAuthenticationRequest) {
      localStorage.removeItem('erp_token')
      localStorage.removeItem('token')
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('erp_user')
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      }
    }
    return Promise.reject(err)
  }
)

export default api
