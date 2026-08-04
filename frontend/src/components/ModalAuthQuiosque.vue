<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  ShieldAlert,
  X,
  Loader2,
  AlertCircle,
  QrCode,
  CheckCircle2,
  KeyRound
} from '@lucide/vue'
import api from '../api/axios'

interface GestorUsuario {
  id: string
  nomeCompleto: string
  cargo: string
  perfilId: string
  perfilNome: string | null
  setorId: string | null
}

const props = defineProps<{
  show: boolean
  titulo?: string
  subtitulo?: string
}>()

const emit = defineEmits<{
  (e: 'fechar'): void
  (e: 'sucesso', gestor: GestorUsuario): void
}>()

const loading = ref(false)
const errorMessage = ref('')
const manualCode = ref('')
const showManualInput = ref(false)

let scannedBuffer = ''
let lastKeyTime = 0
let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null

function clearAutoSubmitTimer() {
  if (autoSubmitTimer) {
    clearTimeout(autoSubmitTimer)
    autoSubmitTimer = null
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!props.show || loading.value) return

  // Ignora se o foco estiver ativamente dentro de um campo de texto visível
  const target = event.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    if (!showManualInput.value) return
  }

  const currentTime = Date.now()

  // Se o tempo entre teclas for maior que 600ms, reseta o buffer acumulado
  if (currentTime - lastKeyTime > 600) {
    scannedBuffer = ''
  }
  lastKeyTime = currentTime
  clearAutoSubmitTimer()

  if (event.key === 'Enter') {
    event.preventDefault()
    const codigoCapturado = scannedBuffer.trim() || manualCode.value.trim()
    if (codigoCapturado) {
      processarCredencial(codigoCapturado)
    }
    scannedBuffer = ''
  } else if (event.key.length === 1) {
    // Acumula caracteres imprimíveis enviadas pelo leitor RFID/Barcode
    scannedBuffer += event.key

    // Auto-submit passivo (300ms debounce) para leitores que não enviam Enter
    autoSubmitTimer = setTimeout(() => {
      const codigoCapturado = scannedBuffer.trim()
      if (codigoCapturado.length >= 4 && !loading.value) {
        processarCredencial(codigoCapturado)
        scannedBuffer = ''
      }
    }, 300)
  }
}

async function processarCredencial(codigo: string) {
  clearAutoSubmitTimer()
  if (!codigo) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { data } = await api.post('/auth/validar-cracha', {
      codigoCredencial: codigo
    })

    if (data?.usuario) {
      manualCode.value = ''
      scannedBuffer = ''
      emit('sucesso', data.usuario)
    } else {
      errorMessage.value = 'Credencial inválida ou sem permissão para este setor.'
    }
  } catch (err: any) {
    console.warn('[ModalAuthQuiosque] Falha ao validar credencial:', err)
    const status = err?.response?.status
    const serverMsg = err?.response?.data?.error

    if (status === 403 || status === 404) {
      errorMessage.value = typeof serverMsg === 'string'
        ? serverMsg
        : 'Credencial inválida ou sem permissão para este setor.'
    } else {
      errorMessage.value = typeof serverMsg === 'string'
        ? serverMsg
        : 'Falha de comunicação com o servidor ao validar credencial.'
    }
  } finally {
    loading.value = false
    scannedBuffer = ''
    manualCode.value = ''
  }
}

function submeterManual() {
  if (manualCode.value.trim()) {
    processarCredencial(manualCode.value.trim())
  }
}

function fecharModal() {
  clearAutoSubmitTimer()
  scannedBuffer = ''
  manualCode.value = ''
  errorMessage.value = ''
  emit('fechar')
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  clearAutoSubmitTimer()
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="show"
        class="quiosque-backdrop"
        role="dialog"
        aria-modal="true"
        @click.self="fecharModal"
      >
        <div class="quiosque-panel">
          <!-- Cabeçalho -->
          <div class="quiosque-header">
            <div class="quiosque-header-title">
              <div class="quiosque-icon-wrap">
                <ShieldAlert :size="20" />
              </div>
              <div>
                <h3 class="quiosque-title">{{ props.titulo || 'Ação Restrita' }}</h3>
                <p class="quiosque-subtitle">{{ props.subtitulo || 'Bipe o Crachá ou RFID do Gestor' }}</p>
              </div>
            </div>
            <button type="button" class="btn-close-quiosque" @click="fecharModal" title="Cancelar">
              <X :size="16" />
            </button>
          </div>

          <!-- Conteúdo Principal -->
          <div class="quiosque-body">
            <!-- Banner de Alerta / Erro -->
            <div v-if="errorMessage" class="quiosque-error-banner" role="alert">
              <AlertCircle :size="16" class="text-slate-900" />
              <span>{{ errorMessage }}</span>
            </div>

            <!-- Animação do Leitor RFID / Scanner Passivo -->
            <div class="quiosque-scan-container">
              <div class="scan-beacon" :class="{ 'scan-beacon--loading': loading }">
                <Loader2 v-if="loading" :size="36" class="spin-anim" />
                <QrCode v-else :size="36" />
              </div>
              
              <div class="scan-instructions">
                <strong class="scan-status-text">
                  {{ loading ? 'Validando Credencial...' : 'Aguardando Leitura por Aproximação...' }}
                </strong>
                <p class="scan-hint-text">
                  Aproxime o crachá RFID no leitor ou utilize o leitor de código de barras USB.
                </p>
              </div>
            </div>

            <!-- Fallback para Entrada Manual se necessário -->
            <div class="quiosque-manual-section">
              <button
                type="button"
                class="btn-toggle-manual"
                @click="showManualInput = !showManualInput"
              >
                <KeyRound :size="14" />
                <span>{{ showManualInput ? 'Ocultar entrada manual' : 'Digitar credencial manualmente' }}</span>
              </button>

              <Transition name="expand">
                <form v-if="showManualInput" @submit.prevent="submeterManual" class="manual-form">
                  <input
                    type="text"
                    v-model="manualCode"
                    placeholder="Digite o código da credencial/matricula..."
                    class="manual-input"
                    :disabled="loading"
                    autofocus
                  />
                  <button type="submit" class="btn-submit-manual" :disabled="loading || !manualCode.trim()">
                    <Loader2 v-if="loading" :size="14" class="spin-anim" />
                    <span>Validar</span>
                  </button>
                </form>
              </Transition>
            </div>
          </div>

          <!-- Rodapé do Modal -->
          <div class="quiosque-footer">
            <button type="button" class="btn-cancel-quiosque" @click="fecharModal" :disabled="loading">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════
   MODAL QUIOSQUE DE AUTENTICAÇÃO (MONOCROMÁTICO E AGRADÁVEL)
   Estética: Industrial Dark/Light Minimalist
══════════════════════════════════════════════════════ */

.quiosque-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.quiosque-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  width: 100%;
  max-width: 28rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.quiosque-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.quiosque-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.quiosque-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: #0f172a;
  color: #ffffff;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quiosque-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.01em;
}

.quiosque-subtitle {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0.15rem 0 0;
  font-weight: 600;
}

.btn-close-quiosque {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #64748b;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-close-quiosque:hover {
  background: #f1f5f9;
  color: #0f172a;
}

/* Body */
.quiosque-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.quiosque-error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8fafc;
  border: 1px solid #0f172a;
  color: #0f172a;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
}

.quiosque-scan-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  padding: 1.25rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
}

.scan-beacon {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  background: #0f172a;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 8px rgba(15, 23, 42, 0.08);
  transition: all 0.3s;
}

.scan-beacon--loading {
  background: #334155;
}

.scan-instructions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.scan-status-text {
  font-size: 0.875rem;
  font-weight: 800;
  color: #0f172a;
}

.scan-hint-text {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

/* Manual Section */
.quiosque-manual-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.btn-toggle-manual {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.btn-toggle-manual:hover {
  color: #0f172a;
}

.manual-form {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}

.manual-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  outline: none;
  background: #ffffff;
  color: #0f172a;
}

.manual-input:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1);
}

.btn-submit-manual {
  background: #0f172a;
  color: #ffffff;
  border: none;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 700;
  border-radius: 0.375rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.btn-submit-manual:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Footer */
.quiosque-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
}

.btn-cancel-quiosque {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 0.375rem;
  cursor: pointer;
}

.btn-cancel-quiosque:hover:not(:disabled) {
  background: #f1f5f9;
}

/* Animations */
.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}

.expand-enter-active, .expand-leave-active {
  transition: all 0.2s ease;
}

.expand-enter-from, .expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
