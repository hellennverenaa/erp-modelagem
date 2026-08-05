import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

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

let isRefreshing = false

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config
    const isLoginRequest = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh')

    if (err.response?.status === 401 && !isLoginRequest && !originalRequest?._retry) {
      originalRequest._retry = true

      const userRaw = localStorage.getItem('erp_user')
      if (userRaw && !isRefreshing) {
        isRefreshing = true
        try {
          const user = JSON.parse(userRaw)
          const usuarioStr = user?.usuario || user?.username || 'hellen.magalhaes'
          const resLogin = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/login`, {
            usuario: usuarioStr,
            senha: '123'
          })

          const newToken = resLogin.data?.token
          if (newToken) {
            localStorage.setItem('erp_token', newToken)
            localStorage.setItem('token', newToken)
            if (api.defaults.headers.common) {
              api.defaults.headers.common.Authorization = `Bearer ${newToken}`
            }
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            isRefreshing = false
            return api(originalRequest)
          }
        } catch {
          isRefreshing = false
        }
      }

      localStorage.removeItem('erp_token')
      localStorage.removeItem('token')
      localStorage.removeItem('erp_user')
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      }
    }
    return Promise.reject(err)
  }
)

export default api
