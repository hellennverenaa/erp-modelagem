import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'


export default defineConfig({
  optimizeDeps: {
    include: ['socket.io-client'],
  },
  plugins: [
    vue()
  ],
  server: {
    // Força o empacotamento via polling se o WebSocket falhar
    watch: {
      usePolling: true,
    },
    // Trava o HMR na porta principal para furar proxies
    hmr: {
      clientPort: 5173
    }
  }
  
})