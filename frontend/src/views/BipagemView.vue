<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../api/axios'
import {
  Barcode,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Layers,
  Box,
  Camera,
  Lock
} from '@lucide/vue'

// ─── Interfaces ──────────────────────────────────────────────────────────
interface Setor {
  id: string
  nome: string
  codigo: string
  tipoOpcaoId: string
}

interface OrdemTeste {
  id: string
  codigoBarras: string
  status: string
  possuiCaixaTeste: boolean
}

// ─── State ───────────────────────────────────────────────────────────────
const setores = ref<Setor[]>([])
const selecionouSetorId = ref('')
const tipoLote = ref<'LOTE_PRINCIPAL' | 'CAIXA_TESTE'>('LOTE_PRINCIPAL')
const codigoLeitura = ref('')

const loadingSetores = ref(false)
const loadingBip = ref(false)
const inputFocusRef = ref<HTMLInputElement | null>(null)

// ─── Trava de Segurança Física ──────────────────────────────────────────
const userRaw = localStorage.getItem('erp_user')
const user = ref<any>(userRaw ? JSON.parse(userRaw) : {})

const podeEditarSetor = computed(() => {
  const perfil = user.value?.perfilNome?.toUpperCase() || ''
  return perfil === 'ADMIN' || perfil === 'GERENTE_MODELAGEM'
})

// ─── Scanner de Câmera ───────────────────────────────────────────────────
const showCameraModal = ref(false)
const cameraError = ref('')
const isCameraActive = ref(false)
let html5QrcodeScanner: Html5Qrcode | null = null

// ─── Web Audio API (Som de bipe nativo industrial) ───────────────────────
function tocarSomSucesso() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    
    oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime)
    
    oscillator.type = 'sine'
    oscillator.start()
    oscillator.stop(audioCtx.currentTime + 0.12)
  } catch (err) {
    console.warn('Erro ao reproduzir audio nativo:', err)
  }
}

// ─── Toasts Feedback ─────────────────────────────────────────────────────
const toastMsg = ref('')
const toastType = ref<'success' | 'error'>('success')
const showToast = ref(false)
let toastTimeout: any = null

function triggerToast(msg: string, type: 'success' | 'error' = 'success') {
  if (toastTimeout) clearTimeout(toastTimeout)
  toastMsg.value = msg
  toastType.value = type
  showToast.value = true
  toastTimeout = setTimeout(() => {
    showToast.value = false
  }, 6000)
}

// ─── Focus management ────────────────────────────────────────────────────
function forcarFocoInput() {
  nextTick(() => {
    if (inputFocusRef.value) {
      inputFocusRef.value.focus()
    }
  })
}

// ─── Camera activation ───────────────────────────────────────────────────
async function iniciarCamera() {
  showCameraModal.value = true
  cameraError.value = ''
  isCameraActive.value = true
  
  nextTick(async () => {
    try {
      html5QrcodeScanner = new Html5Qrcode('camera-reader')
      const config = {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0
      }
      
      await html5QrcodeScanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          codigoLeitura.value = decodedText
          tocarSomSucesso()
          pararCamera()
          triggerToast(`Codigo escaneado com sucesso: ${decodedText}`, 'success')
        },
        () => {
          // Varredura sem sucesso silenciosa
        }
      )
    } catch (err: any) {
      console.error('[BipagemView] Erro ao iniciar câmera:', err)
      cameraError.value = 'Nao foi possivel acessar a camera do tablet. Verifique as permissoes.'
      isCameraActive.value = false
    }
  })
}

async function pararCamera() {
  showCameraModal.value = false
  isCameraActive.value = false
  if (html5QrcodeScanner) {
    try {
      if (html5QrcodeScanner.isScanning) {
        await html5QrcodeScanner.stop()
      }
    } catch (err) {
      console.error('[BipagemView] Erro ao parar câmera:', err)
    } finally {
      html5QrcodeScanner = null
    }
  }
  forcarFocoInput()
}

// ─── Lifecycle — Load initial data ───────────────────────────────────────
onMounted(async () => {
  loadingSetores.value = true
  try {
    const resSetores = await api.get('/admin/setores')
    setores.value = resSetores.data

    if (user.value.setorId && setores.value.some(s => s.id === user.value.setorId)) {
      selecionouSetorId.value = user.value.setorId
    } else if (setores.value.length > 0) {
      selecionouSetorId.value = setores.value[0].id
    }
  } catch (err: any) {
    console.error('[BipagemView] Erro ao carregar setores:', err)
    triggerToast('Nao foi possivel carregar a lista de setores ativos.', 'error')
  } finally {
    loadingSetores.value = false
    forcarFocoInput()
  }
})

// ─── Business Logic: Bipagem ─────────────────────────────────────────────
async function processarBipagem(acao: 'entrada' | 'saida') {
  const codigo = codigoLeitura.value.trim()
  if (!codigo) {
    triggerToast('Insira ou bipa um codigo de barras valido para prosseguir.', 'error')
    forcarFocoInput()
    return
  }

  if (!selecionouSetorId.value) {
    triggerToast('Por favor, selecione o seu Setor operacional atual.', 'error')
    return
  }

  loadingBip.value = true
  showToast.value = false

  try {
    const resLotes = await api.get('/lotes')
    const lotesList: OrdemTeste[] = resLotes.data
    
    let ordemTesteId = ''
    const loteEncontrado = lotesList.find(
      l => l.codigoBarras.toUpperCase() === codigo.toUpperCase() || l.id === codigo
    )

    if (loteEncontrado) {
      ordemTesteId = loteEncontrado.id
    } else {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(codigo)
      if (isUUID) {
        ordemTesteId = codigo
      } else {
        throw new Error('LOTE_NOT_FOUND')
      }
    }

    const endpoint = acao === 'entrada' ? '/rastreamentos/bipar-entrada' : '/rastreamentos/bipar-saida'
    const payload = {
      ordemTesteId,
      setorId: selecionouSetorId.value,
      tipoLote: tipoLote.value,
    }

    await api.post(endpoint, payload)

    const msgSucesso = acao === 'entrada'
      ? 'Entrada registrada com sucesso.'
      : 'Saida registrada com sucesso. Handoff concluido.'
    
    triggerToast(`${msgSucesso} (Ordem: ${loteEncontrado?.codigoBarras || codigo})`, 'success')
    codigoLeitura.value = ''
  } catch (err: any) {
    console.error('[BipagemView] Erro na bipagem:', err)
    
    const response = err.response
    const status = response?.status
    const errorData = response?.data

    if (err.message === 'LOTE_NOT_FOUND') {
      triggerToast(`Ordem de teste com codigo "${codigo}" nao foi localizada no sistema.`, 'error')
    } else if (status === 403) {
      const descError = errorData?.error || 'Acesso ou liberacao negada pelo Gate de Qualidade.'
      triggerToast(`Handoff Negado: ${descError}`, 'error')
    } else if (status === 409) {
      triggerToast('Bipagem duplicada: Este lote ja esta em processo neste setor.', 'error')
    } else if (status === 404) {
      triggerToast('Nenhuma bipagem de entrada ativa localizada para efetuar a saida deste lote.', 'error')
    } else {
      const descError = errorData?.error || 'Erro de rede ou comunicacao com o servidor.'
      triggerToast(`Falha operacional: ${descError}`, 'error')
    }
  } finally {
    loadingBip.value = false
    forcarFocoInput()
  }
}
</script>

<template>
  <div class="bp-root">
    <!-- ══ TOAST NOTIFICATION ═══════════════════════════════════════════ -->
    <Transition name="toast-slide">
      <div v-if="showToast" class="bp-toast" :class="`bp-toast--${toastType}`" role="alert">
        <AlertTriangle v-if="toastType === 'error'" :size="20" class="toast-icon" aria-hidden="true" />
        <CheckCircle2 v-else :size="20" class="toast-icon" aria-hidden="true" />
        <span class="toast-text">{{ toastMsg }}</span>
      </div>
    </Transition>

    <!-- ══ MODAL DE CÂMERA SCANNER ═══════════════════════════════════════ -->
    <Transition name="block-pop">
      <div v-if="showCameraModal" class="camera-modal-overlay" role="dialog" aria-modal="true">
        <div class="camera-modal-content">
          <div class="camera-modal-header">
            <span class="camera-modal-title">Leitor de Câmera</span>
            <span class="camera-modal-desc">Aponte a câmera traseira do tablet para o código de barras da ordem</span>
          </div>
          
          <div class="camera-scanner-area">
            <div id="camera-reader" class="camera-canvas"></div>
            <div v-if="cameraError" class="camera-error-banner">
              <AlertTriangle :size="24" class="error-icon" aria-hidden="true" />
              <span>{{ cameraError }}</span>
            </div>
          </div>
          
          <button
            type="button"
            class="btn-cancel-camera"
            @click="pararCamera"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Transition>

    <!-- ══ CARD CONTAINER (Tablet-focused layout) ════════════════════════ -->
    <main class="bp-card">
      <header class="bp-card-header">
        <div class="bp-header-info">
          <Barcode :size="24" class="header-icon" aria-hidden="true" />
          <div>
            <h2 class="bp-card-title">Bipagem Operacional</h2>
            <p class="bp-card-desc">Chão de fábrica — Registro de rastreamento de produção</p>
          </div>
        </div>
      </header>

      <form @submit.prevent class="bp-form">
        <!-- ── SETOR SELECTOR ── -->
        <div class="field-group">
          <div class="label-row-security">
            <label for="select-setor" class="field-label">Setor Operacional</label>
            <span v-if="!podeEditarSetor" class="security-badge-locked">
              <Lock :size="10" aria-hidden="true" />
              Fixo por Lotação
            </span>
          </div>
          <div class="select-wrapper">
            <Settings :size="16" class="select-icon" aria-hidden="true" />
            <select
              id="select-setor"
              v-model="selecionouSetorId"
              class="select-input"
              :class="{ 'select-input--disabled': !podeEditarSetor }"
              :disabled="loadingSetores || loadingBip || !podeEditarSetor"
            >
              <option v-if="loadingSetores" value="">Carregando setores...</option>
              <option v-else-if="setores.length === 0" value="">Nenhum setor disponível</option>
              <option v-for="setor in setores" :key="setor.id" :value="setor.id">
                {{ setor.nome }} ({{ setor.codigo }})
              </option>
            </select>
          </div>
          <span v-if="!podeEditarSetor" class="field-hint-security">
            Para alterar o setor operacional fixo deste terminal, solicite a alteração a um Administrador ou Gerente.
          </span>
        </div>

        <!-- ── TIPO DE LOTE SELECTOR ── -->
        <div class="field-group">
          <span class="field-label">Tipo de Lote</span>
          <div class="tabs-selector">
            <button
              type="button"
              class="tab-btn"
              :class="{ 'tab-btn--active': tipoLote === 'LOTE_PRINCIPAL' }"
              @click="tipoLote = 'LOTE_PRINCIPAL'"
              :disabled="loadingBip"
            >
              <Layers :size="16" aria-hidden="true" />
              <span>Lote Principal</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              :class="{ 'tab-btn--active': tipoLote === 'CAIXA_TESTE' }"
              @click="tipoLote = 'CAIXA_TESTE'"
              :disabled="loadingBip"
            >
              <Box :size="16" aria-hidden="true" />
              <span>Caixa Teste</span>
            </button>
          </div>
        </div>

        <!-- ── BARCODE INPUT & CAMERA ACTION ── -->
        <div class="field-group">
          <label for="input-barcode" class="field-label">Código de Barras (Ordem de Teste)</label>
          <div class="input-action-row">
            <div class="barcode-input-wrapper">
              <Barcode :size="24" class="barcode-input-icon" aria-hidden="true" />
              <input
                id="input-barcode"
                ref="inputFocusRef"
                v-model="codigoLeitura"
                type="text"
                class="barcode-input"
                placeholder="Aguardando bipagem..."
                autocomplete="off"
                :disabled="loadingBip"
                @keydown.enter.prevent="processarBipagem('entrada')"
              />
            </div>
            <button
              type="button"
              class="btn-camera"
              @click="iniciarCamera"
              :disabled="loadingBip"
              title="Ler código com a câmera traseira"
              aria-label="Escanear com a câmera"
            >
              <Camera :size="20" aria-hidden="true" />
            </button>
          </div>
          <span class="field-hint">Foque este campo e utilize o leitor físico ou clique no ícone da câmera para escanear</span>
        </div>

        <!-- ── TOUCH TARGET BUTTONS (min 56px height) ── -->
        <div class="action-grid">
          <button
            type="button"
            class="btn-action btn-action--entrada"
            :disabled="loadingBip"
            @click="processarBipagem('entrada')"
          >
            <Loader2 v-if="loadingBip" :size="20" class="spinner" aria-hidden="true" />
            <ArrowRight v-else :size="20" aria-hidden="true" />
            <span>Registrar Entrada</span>
          </button>

          <button
            type="button"
            class="btn-action btn-action--saida"
            :disabled="loadingBip"
            @click="processarBipagem('saida')"
          >
            <Loader2 v-if="loadingBip" :size="20" class="spinner" aria-hidden="true" />
            <ArrowLeft v-else :size="20" aria-hidden="true" />
            <span>Registrar Saída</span>
          </button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════
   ROOT LAYOUT & CARDS
═══════════════════════════════════════════════════════ */
.bp-root {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: calc(100vh - 8rem);
  padding: 1rem;
}

.bp-card {
  width: 100%;
  max-width: 32rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 10px 15px -3px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.bp-card-header {
  padding: 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.bp-header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  color: #1e40af;
  flex-shrink: 0;
}

.bp-card-title {
  font-size: 1.125rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin: 0 0 0.125rem;
}

.bp-card-desc {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.bp-form {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ═══════════════════════════════════════════════════════
   FIELD GROUPS & INPUTS
═══════════════════════════════════════════════════════ */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.label-row-security {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.security-badge-locked {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.field-hint {
  font-size: 0.6875rem;
  color: #94a3b8;
  line-height: 1.3;
}

.field-hint-security {
  font-size: 0.6875rem;
  color: #94a3b8;
  line-height: 1.3;
  margin-top: 0.125rem;
}

/* Dropdown input */
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.select-icon {
  position: absolute;
  left: 0.875rem;
  color: #94a3b8;
  pointer-events: none;
}

.select-input {
  width: 100%;
  padding: 0.625rem 0.875rem 0.625rem 2.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  color: #0f172a;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.875rem center;
  background-size: 1rem;
}

.select-input:focus {
  border-color: #1e40af;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.08);
}

.select-input--disabled {
  background-color: #f8fafc !important;
  color: #94a3b8 !important;
  cursor: not-allowed !important;
  background-image: none !important;
  border-color: #e2e8f0 !important;
}

/* Tabs */
.tabs-selector {
  display: flex;
  background: #f1f5f9;
  padding: 0.25rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  font-family: inherit;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover:not(:disabled) {
  color: #0f172a;
}

.tab-btn--active {
  background: #ffffff;
  color: #1e40af;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tab-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Barcode Input and camera action row */
.input-action-row {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}

.barcode-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.barcode-input-icon {
  position: absolute;
  left: 1.25rem;
  color: #94a3b8;
  pointer-events: none;
}

.barcode-input {
  width: 100%;
  padding: 1.125rem 1.25rem 1.125rem 3.5rem;
  font-size: 1.5rem;
  font-family: monospace;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #0f172a;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 0.75rem;
  outline: none;
  transition: all 0.15s ease;
}

.barcode-input::placeholder {
  color: #cbd5e1;
  font-family: inherit;
  font-weight: 500;
  font-size: 1.25rem;
  letter-spacing: 0;
}

.barcode-input:focus {
  border-color: #1e40af;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(30, 64, 175, 0.1);
}

.btn-camera {
  width: 3.5rem; /* Combinar com a altura de 56px */
  height: 3.5rem;
  background: #f1f5f9;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #475569;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-camera:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
  border-color: #cbd5e1;
}

.btn-camera:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-camera:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ═══════════════════════════════════════════════════════
   ACTION BUTTONS
═══════════════════════════════════════════════════════ */
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 0.5rem;
}

@media (max-width: 480px) {
  .action-grid {
    grid-template-columns: 1fr;
  }
}

.btn-action {
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: inherit;
  color: #ffffff;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.15s;
  will-change: transform;
}

.btn-action:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action--entrada {
  background: linear-gradient(135deg, #0f172a, #1e40af);
}

.btn-action--entrada:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(30, 64, 175, 0.25);
}

.btn-action--saida {
  background: linear-gradient(135deg, #1e293b, #475569);
}

.btn-action--saida:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(71, 85, 105, 0.25);
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════════════════════
   TOASTS FEEDBACK
═══════════════════════════════════════════════════════ */
.bp-toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  max-width: 24rem;
  border-width: 1px;
  border-style: solid;
}

.bp-toast--success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.bp-toast--error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.toast-text {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

/* Toast Transition */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

/* ═══════════════════════════════════════════════════════
   CAMERA OVERLAY MODAL
═══════════════════════════════════════════════════════ */
.camera-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 10000;
}

.camera-modal-content {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  width: 100%;
  max-width: 28rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.camera-modal-header {
  display: flex;
  flex-direction: column;
}

.camera-modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.camera-modal-desc {
  font-size: 0.75rem;
  color: #64748b;
}

.camera-scanner-area {
  position: relative;
  width: 100%;
  aspect-ratio: 1.0;
  background: #0f172a;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 2px solid #e2e8f0;
}

.camera-canvas {
  width: 100%;
  height: 100%;
}

.camera-error-banner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  background: #fef2f2;
  color: #b91c1c;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 600;
}

.btn-cancel-camera {
  height: 3.5rem;
  width: 100%;
  background: #fef2f2;
  border: 1.5px solid #fecaca;
  border-radius: 0.75rem;
  color: #b91c1c;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-cancel-camera:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}

.btn-cancel-camera:active {
  transform: scale(0.97);
}

/* Animations */
.block-pop-enter-active { transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.block-pop-leave-active { transition: all 0.18s ease; }
.block-pop-enter-from  { opacity: 0; transform: translateY(-8px) scale(0.96); }
.block-pop-leave-to    { opacity: 0; transform: translateY(-6px) scale(0.97); }

.field-reveal-enter-active { transition: all 0.2s ease; }
.field-reveal-leave-active { transition: all 0.15s ease; }
.field-reveal-enter-from   { opacity: 0; transform: translateY(-4px); max-height: 0; }
.field-reveal-leave-to     { opacity: 0; max-height: 0; }
</style>
