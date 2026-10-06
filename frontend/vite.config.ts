import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.GATEWAY_URL || 'http://localhost:2399'

  return {
    optimizeDeps: {
      include: ['socket.io-client'],
    },
    plugins: [vue()],
    server: {
      // O HMR usa a origem/porta real do Vite; não fixe clientPort para 5173,
      // pois o Vite pode escolher outra porta quando a padrão já está ocupada.
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
