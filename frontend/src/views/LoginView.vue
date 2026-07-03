<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { LogIn, User, Lock, AlertCircle, Loader2 } from '@lucide/vue'
import api from '../api/axios'

const router = useRouter()

const form = reactive({ usuario: '', senha: '' })
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!form.usuario.trim() || !form.senha.trim()) {
    errorMsg.value = 'Preencha o usuario e a senha para continuar.'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    const { data } = await api.post('/auth/login', {
      usuario: form.usuario,
      senha: form.senha,
    })

    const token = data.token
    if (!token) throw new Error('Token nao retornado pelo servidor.')

    localStorage.setItem('erp_token', token)
    if (data.usuario) localStorage.setItem('erp_user', JSON.stringify(data.usuario))

    router.push({ name: 'dashboard' })
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 401) {
      errorMsg.value = 'Credenciais invalidas. Verifique seu usuario e senha.'
    } else if (status === 429) {
      errorMsg.value = 'Muitas tentativas de acesso. Aguarde alguns minutos.'
    } else if (status >= 500) {
      errorMsg.value = 'Servico indisponivel. Tente novamente mais tarde.'
    } else {
      errorMsg.value = 'Nao foi possivel conectar ao servidor de autenticacao.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-root">
    <!-- Subtle dot-grid background -->
    <div class="bg-grid" aria-hidden="true"></div>

    <main class="login-main">
      <!-- Brand -->
      <header class="brand-header">
        <div class="brand-logo" aria-hidden="true">
          <div class="logo-mark"></div>
        </div>
        <div class="brand-text">
          <h1 class="brand-name">ERP Modelagem</h1>
          <p class="brand-subtitle">Sistema de Rastreamento de Producao</p>
        </div>
      </header>

      <!-- Card -->
      <div class="login-card" role="main">
        <div class="card-inner">
          <div class="card-heading">
            <h2 class="card-title">Acesso ao Sistema</h2>
            <p class="card-desc">Insira suas credenciais de rede DASS</p>
          </div>

          <!-- Error -->
          <Transition name="error-fade">
            <div v-if="errorMsg" class="error-banner" role="alert" aria-live="assertive">
              <AlertCircle :size="18" class="error-icon" aria-hidden="true" />
              <span class="error-text">{{ errorMsg }}</span>
            </div>
          </Transition>

          <!-- Form -->
          <form @submit.prevent="handleLogin" class="login-form" novalidate>
            <div class="field-group">
              <label for="usuario" class="field-label">Usuario</label>
              <div class="input-wrapper">
                <User :size="16" class="input-icon" aria-hidden="true" />
                <input
                  id="usuario"
                  v-model="form.usuario"
                  type="text"
                  autocomplete="username"
                  spellcheck="false"
                  autocapitalize="off"
                  placeholder="Ex: JOAO.SILVA"
                  class="field-input"
                  :disabled="loading"
                  required
                />
              </div>
            </div>

            <div class="field-group">
              <label for="senha" class="field-label">Senha</label>
              <div class="input-wrapper">
                <Lock :size="16" class="input-icon" aria-hidden="true" />
                <input
                  id="senha"
                  v-model="form.senha"
                  type="password"
                  autocomplete="current-password"
                  placeholder="Sua senha de rede"
                  class="field-input"
                  :disabled="loading"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn-submit"
              :disabled="loading"
              :aria-busy="loading"
            >
              <Loader2 v-if="loading" :size="18" class="btn-spinner" aria-hidden="true" />
              <LogIn v-else :size="18" aria-hidden="true" />
              <span>{{ loading ? 'Autenticando...' : 'Entrar' }}</span>
            </button>
          </form>
        </div>
      </div>

      <!-- Footer -->
      <footer class="login-footer">
        <span>Dass Couros &amp; Calcados</span>
        <span class="footer-sep" aria-hidden="true">|</span>
        <span>ERP v4.0.0</span>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* ==============================
   ROOT & BACKGROUND
============================== */
.login-root {
  min-height: 100dvh;
  background-color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  position: relative;
  overflow: hidden;
}

.bg-grid {
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.45;
  pointer-events: none;
  z-index: 0;
}

/* ==============================
   MAIN LAYOUT — scales from mobile to 4K TVs
============================== */
.login-main {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 28rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

@media (min-width: 1280px) { .login-main { max-width: 34rem; } }
@media (min-width: 1536px) { .login-main { max-width: 40rem; } }
@media (min-width: 1920px) { .login-main { max-width: 48rem; gap: 2.5rem; } }
@media (min-width: 2560px) { .login-main { max-width: 64rem; gap: 3rem; } }

/* ==============================
   BRAND HEADER
============================== */
.brand-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.brand-logo {
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(30, 64, 175, 0.3);
  flex-shrink: 0;
}

.logo-mark {
  width: 1.25rem;
  height: 1.25rem;
  background: #ffffff;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

.brand-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
  line-height: 1.2;
  margin: 0;
}

.brand-subtitle {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0.125rem 0 0;
}

@media (min-width: 1536px) {
  .brand-logo { width: 4rem; height: 4rem; border-radius: 1rem; }
  .logo-mark { width: 1.625rem; height: 1.625rem; }
  .brand-name { font-size: 1.75rem; }
  .brand-subtitle { font-size: 0.8125rem; }
}
@media (min-width: 2560px) {
  .brand-logo { width: 5.5rem; height: 5.5rem; border-radius: 1.25rem; }
  .logo-mark { width: 2.25rem; height: 2.25rem; }
  .brand-name { font-size: 2.5rem; }
  .brand-subtitle { font-size: 1.125rem; }
}

/* ==============================
   LOGIN CARD
============================== */
.login-card {
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 1.25rem;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.05),
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.7) inset;
}

.card-inner {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (min-width: 1536px) { .card-inner { padding: 3rem; gap: 2rem; } }
@media (min-width: 2560px) { .card-inner { padding: 4rem; gap: 2.5rem; } }

/* ==============================
   CARD HEADING
============================== */
.card-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0 0 0.25rem;
}

.card-desc {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

@media (min-width: 1536px) { .card-title { font-size: 2rem; } .card-desc { font-size: 1.125rem; } }
@media (min-width: 2560px) { .card-title { font-size: 2.75rem; } .card-desc { font-size: 1.5rem; } }

/* ==============================
   ERROR BANNER
============================== */
.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.75rem;
  color: #b91c1c;
}

.error-icon { flex-shrink: 0; margin-top: 1px; }

.error-text {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.45;
}

@media (min-width: 2560px) {
  .error-text { font-size: 1.25rem; }
}

.error-fade-enter-active,
.error-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.error-fade-enter-from,
.error-fade-leave-to { opacity: 0; transform: translateY(-6px); }

/* ==============================
   FORM
============================== */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ==============================
   FIELD
============================== */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #374151;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

@media (min-width: 1536px) { .field-label { font-size: 0.9375rem; } }
@media (min-width: 2560px) { .field-label { font-size: 1.25rem; } }

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 0.875rem;
  color: #94a3b8;
  pointer-events: none;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.input-wrapper:focus-within .input-icon { color: #1e40af; }

.field-input {
  width: 100%;
  padding: 0.75rem 0.875rem 0.75rem 2.75rem;
  font-size: 0.9375rem;
  font-family: inherit;
  font-weight: 500;
  color: #0f172a;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.625rem;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.field-input::placeholder { color: #94a3b8; font-weight: 400; }

.field-input:focus {
  border-color: #1e40af;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.12);
}

.field-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f1f5f9;
}

@media (min-width: 1536px) {
  .field-input {
    font-size: 1.125rem;
    padding: 1rem 1.125rem 1rem 3.25rem;
    border-radius: 0.75rem;
  }
  .input-icon { left: 1.125rem; }
}
@media (min-width: 2560px) {
  .field-input {
    font-size: 1.5rem;
    padding: 1.375rem 1.375rem 1.375rem 4.25rem;
    border-radius: 1rem;
    border-width: 2px;
  }
  .input-icon { left: 1.375rem; }
}

/* ==============================
   SUBMIT BUTTON
============================== */
.btn-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.01em;
  color: #ffffff;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%);
  border: none;
  border-radius: 0.625rem;
  cursor: pointer;
  margin-top: 0.5rem;
  will-change: transform;
  transition:
    opacity 0.15s ease,
    box-shadow 0.2s ease,
    transform 0.1s cubic-bezier(0.32, 0.72, 0, 1);
}

.btn-submit:hover:not(:disabled) {
  opacity: 0.92;
  box-shadow: 0 8px 24px rgba(30, 64, 175, 0.35);
  transform: translateY(-1px);
}

.btn-submit:active:not(:disabled) {
  transform: scale(0.98) translateY(0px);
  box-shadow: none;
}

.btn-submit:focus-visible {
  outline: 3px solid #1e40af;
  outline-offset: 2px;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (min-width: 1536px) {
  .btn-submit {
    font-size: 1.125rem;
    padding: 1.125rem 2rem;
    border-radius: 0.75rem;
  }
}
@media (min-width: 2560px) {
  .btn-submit {
    font-size: 1.5rem;
    padding: 1.5rem 2.5rem;
    border-radius: 1rem;
    gap: 0.75rem;
  }
}

/* ==============================
   FOOTER
============================== */
.login-footer {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.footer-sep { color: #cbd5e1; }

@media (min-width: 2560px) {
  .login-footer { font-size: 1rem; gap: 1rem; }
}
</style>
