<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LayoutDashboard, LogOut, User } from '@lucide/vue'

const router = useRouter()
const userRaw = localStorage.getItem('erp_user')
const user = ref<{ nomeCompleto?: string; usuario?: string }>(
  userRaw ? JSON.parse(userRaw) : {}
)

function logout() {
  localStorage.removeItem('erp_token')
  localStorage.removeItem('erp_user')
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="dash-root">
    <header class="dash-header">
      <div class="dash-brand">
        <LayoutDashboard :size="20" aria-hidden="true" />
        <span>ERP Modelagem — Dashboard</span>
      </div>
      <div class="dash-user">
        <User :size="16" aria-hidden="true" />
        <span v-if="user?.nomeCompleto">{{ user.nomeCompleto }}</span>
        <span v-else-if="user?.usuario">{{ user.usuario }}</span>
        <button id="btn-logout" class="btn-logout" @click="logout" type="button">
          <LogOut :size="16" aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </header>

    <main class="dash-main">
      <div class="placeholder-card">
        <h2 class="placeholder-title">Em Construcao</h2>
        <p class="placeholder-desc">Os modulos do ERP serao adicionados nesta area em breve.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dash-root {
  min-height: 100dvh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.dash-brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.dash-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.btn-logout {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  color: #374151;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-logout:hover { background: #e2e8f0; border-color: #cbd5e1; }
.btn-logout:focus-visible { outline: 2px solid #1e40af; outline-offset: 2px; }

.dash-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
}

.placeholder-card {
  text-align: center;
  max-width: 28rem;
}

.placeholder-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
  margin: 0 0 0.5rem;
}

.placeholder-desc {
  font-size: 0.9375rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
}
</style>
