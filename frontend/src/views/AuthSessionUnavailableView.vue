<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../api/auth.store'

const router = useRouter()
const loading = ref(false)
const feedback = ref('')

async function tentarNovamente() {
  if (loading.value) return

  loading.value = true
  feedback.value = ''

  try {
    await authStore.refreshCurrentUser()
    if (!authStore.user.value) throw new Error('O perfil do usuário ainda não foi carregado.')
    await router.replace({ name: 'dashboard' })
  } catch {
    feedback.value = 'Ainda não foi possível validar a sessão. Tente novamente em instantes.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="session-unavailable-page">
    <section class="session-unavailable-card" aria-labelledby="session-unavailable-title">
      <div class="session-unavailable-icon" aria-hidden="true">!</div>
      <h1 id="session-unavailable-title">Não foi possível validar a sessão</h1>
      <p>Não foi possível confirmar sua sessão agora. Verifique a conexão e tente novamente em instantes.</p>
      <p v-if="feedback" class="session-unavailable-feedback" role="status">{{ feedback }}</p>
      <button type="button" :disabled="loading" @click="tentarNovamente">
        {{ loading ? 'Verificando…' : 'Tentar novamente' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.session-unavailable-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: #f1f5f9;
  color: #172033;
  font-family: Inter, system-ui, sans-serif;
}

.session-unavailable-card {
  width: min(100%, 32rem);
  padding: 2.25rem;
  border: 1px solid #dbe3ee;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 16px 40px rgb(15 23 42 / 8%);
  text-align: center;
}

.session-unavailable-icon {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  background: #fff7ed;
  color: #c2410c;
  font-size: 1.5rem;
  font-weight: 700;
}

h1 {
  margin: 0 0 0.75rem;
  font-size: 1.35rem;
}

p {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}

.session-unavailable-feedback {
  margin-top: 0.75rem;
  color: #b42318;
}

button {
  min-height: 2.75rem;
  margin-top: 1.5rem;
  padding: 0.65rem 1.25rem;
  border: 0;
  border-radius: 0.65rem;
  background: #2145b5;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
