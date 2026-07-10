import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  optimizeDeps: {
    include: ['socket.io-client'],
  },
  plugins: [
    tailwindcss(),
    vue(),
  ]
})