<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Layers,
  ListOrdered,
  ClipboardCheck,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Barcode,
  Printer
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'
import RouteBuilder from '../components/RouteBuilder.vue'

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Marca {
  id: string
  nome: string
}

interface Planta {
  id: string
  nome: string
  cidade: string | null
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

// ─── Navegação e Roteamento ──────────────────────────────────────────────────
const router = useRouter()

// ─── Estado do Stepper ───────────────────────────────────────────────────────
const currentStep = ref(1) // 1: Modelo, 2: Rota, 3: Ordem

// ─── Dados Compartilhados / Estado do Formulário ──────────────────────────────
const marcas = ref<Marca[]>([])
const plantas = ref<Planta[]>([])
const loadingInit = ref(true)

// Passo 1: Modelo
const formModelo = ref({
  nome: '',
  codigoProduto: '',
  marcaId: '',
  temporada: 'SS26'
})
const createdModeloId = ref('')
const createdModeloName = ref('')
const createdModeloCode = ref('')
const loadingModelo = ref(false)
const errorModelo = ref('')

// Passo 2: Rota
const routeBuilderRef = ref<any>(null)
const loadingRota = ref(false)

// Passo 3: Ordem
const formOrdem = ref({
  plantaId: '',
  prioridadePcp: 'MEDIA',
  possuiCaixaTeste: false,
  observacoes: ''
})
const loadingOrdem = ref(false)
const errorOrdem = ref('')
const createdOrdem = ref<{ id: string; codigoBarras: string; possuiCaixaTeste?: boolean } | null>(null)

// Toasts
const toasts = ref<Toast[]>([])
let toastIdCounter = 0

function addToast(type: 'success' | 'error', message: string) {
  const id = toastIdCounter++
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

// ─── Ciclo de Vida ──────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [marcasRes, plantasRes] = await Promise.all([
      api.get<Marca[]>('/admin/marcas'),
      api.get<Planta[]>('/admin/plantas')
    ])
    marcas.value = marcasRes.data || []
    plantas.value = plantasRes.data || []
    
    if (plantas.value.length > 0) {
      formOrdem.value.plantaId = plantas.value[0].id
    }
  } catch (err) {
    addToast('error', 'Erro ao carregar dados iniciais.')
  } finally {
    loadingInit.value = false
  }
})

// ─── Handlers do Stepper ─────────────────────────────────────────────────────

// Salvar Modelo (Passo 1 -> 2)
async function submitModelo() {
  if (!formModelo.value.nome.trim() || !formModelo.value.codigoProduto.trim() || !formModelo.value.marcaId) {
    errorModelo.value = 'Preencha todos os campos obrigatórios do modelo.'
    return
  }

  loadingModelo.value = true
  errorModelo.value = ''

  try {
    const response = await api.post('/admin/modelos', {
      marcaId: formModelo.value.marcaId,
      codigoProduto: formModelo.value.codigoProduto.trim(),
      nome: formModelo.value.nome.trim(),
      temporada: formModelo.value.temporada
    })

    const modelo = response.data.modelo || response.data
    createdModeloId.value = modelo.id
    createdModeloName.value = modelo.nome
    createdModeloCode.value = modelo.codigoProduto

    addToast('success', 'Modelo cadastrado com sucesso!')
    currentStep.value = 2
  } catch (err: any) {
    console.error(err)
    if (err.response?.status === 409) {
      errorModelo.value = 'Falha: O código do modelo já está em uso.'
    } else {
      errorModelo.value = err.response?.data?.error || 'Erro ao cadastrar modelo.'
    }
  } finally {
    loadingModelo.value = false
  }
}

// Salvar Rota (Passo 2 -> 3)
function triggerSaveRota() {
  if (routeBuilderRef.value) {
    loadingRota.value = true
    routeBuilderRef.value.salvarRota()
  }
}

function onRotaSalva() {
  loadingRota.value = false
  currentStep.value = 3
}

// Salvar Ordem (Passo 3 -> Conclusão)
async function submitOrdem() {
  if (!formOrdem.value.plantaId) {
    errorOrdem.value = 'Selecione uma planta de fabricação.'
    return
  }

  loadingOrdem.value = true
  errorOrdem.value = ''

  try {
    const response = await api.post('/lotes', {
      modeloId: createdModeloId.value,
      plantaId: formOrdem.value.plantaId,
      prioridadePcp: formOrdem.value.prioridadePcp,
      possuiCaixaTeste: formOrdem.value.possuiCaixaTeste,
      observacoes: formOrdem.value.observacoes.trim() || null
    })

    createdOrdem.value = response.data.lote || response.data
    addToast('success', 'Ordem de teste gerada com sucesso!')
  } catch (err: any) {
    console.error(err)
    errorOrdem.value = err.response?.data?.error || 'Erro ao gerar ordem de teste.'
  }
}

const loadingPdf = ref(false)
const user = computed(() => authStore.user.value)

async function imprimirEtiqueta(tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL' = 'LOTE_PRINCIPAL') {
  if (!createdOrdem.value?.id) return
  if (loadingPdf.value) return
  
  loadingPdf.value = true
  try {
    const response = await api.post('/etiquetas/gerar', {
      ordemTesteIds: [createdOrdem.value.id],
      setorId: user.value?.setorId || 'ecb2d21d-51db-41a7-8261-17e8a5f03fed',
      tipoLote
    }, {
      responseType: 'blob'
    })
    
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const pdfUrl = window.URL.createObjectURL(blob)
    window.open(pdfUrl, '_blank')
    
    setTimeout(() => {
      window.URL.revokeObjectURL(pdfUrl)
    }, 60000)
  } catch (err) {
    console.error('[Imprimir] Erro ao gerar etiquetas em PDF:', err)
    addToast('error', 'Erro ao gerar etiqueta em PDF.')
  } finally {
    loadingPdf.value = false
  }
}

function resetWizard() {
  currentStep.value = 1
  formModelo.value = { nome: '', codigoProduto: '', marcaId: '', temporada: 'SS26' }
  createdModeloId.value = ''
  createdModeloName.value = ''
  createdModeloCode.value = ''
  createdOrdem.value = null
  formOrdem.value = { plantaId: plantas.value[0]?.id || '', prioridadePcp: 'MEDIA', possuiCaixaTeste: false, observacoes: '' }
  errorModelo.value = ''
  errorOrdem.value = ''
}
</script>

<template>
  <div class="wiz-root">
    <!-- Toasts -->
    <div class="wiz-toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" :class="['wiz-toast', `wiz-toast--${t.type}`]">
        <CheckCircle v-if="t.type === 'success'" :size="16" aria-hidden="true" />
        <AlertCircle v-else :size="16" aria-hidden="true" />
        <span class="wiz-toast-text">{{ t.message }}</span>
      </div>
    </div>

    <!-- ── STEPPER VISUAL ── -->
    <div class="wiz-stepper-header" v-if="!createdOrdem">
      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 1, 'wiz-step--completed': currentStep > 1 }">
        <div class="wiz-step-bubble">
          <Layers v-if="currentStep <= 1" :size="16" aria-hidden="true" />
          <CheckCircle v-else :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 1</span>
          <span class="wiz-step-name">Modelo</span>
        </div>
      </div>
      <div class="wiz-step-connector" :class="{ 'wiz-step-connector--active': currentStep > 1 }"></div>
      
      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 2, 'wiz-step--completed': currentStep > 2 }">
        <div class="wiz-step-bubble">
          <ListOrdered v-if="currentStep <= 2" :size="16" aria-hidden="true" />
          <CheckCircle v-else :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 2</span>
          <span class="wiz-step-name">Rota</span>
        </div>
      </div>
      <div class="wiz-step-connector" :class="{ 'wiz-step-connector--active': currentStep > 2 }"></div>

      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 3 }">
        <div class="wiz-step-bubble">
          <ClipboardCheck :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 3</span>
          <span class="wiz-step-name">Ordem</span>
        </div>
      </div>
    </div>

    <!-- ── LOADING INICIAL ── -->
    <div v-if="loadingInit" class="wiz-loading-block">
      <Loader2 :size="32" class="wiz-spinner" aria-hidden="true" />
      <span>Carregando dados necessários...</span>
    </div>

    <!-- ── FLOW STEPS v-if CONTROL ── -->
    <div v-else class="wiz-card">
      
      <!-- CONCLUSÃO SUCESSO -->
      <div v-if="createdOrdem" class="wiz-done-block">
        <div class="wiz-done-icon-wrap" aria-hidden="true">
          <CheckCircle :size="36" />
        </div>
        <h2 class="wiz-done-title">Ordem de Teste Criada!</h2>
        <p class="wiz-done-desc">
          O modelo <strong class="text-slate-900">{{ createdModeloName }}</strong> foi configurado com sucesso e sua Ordem de Teste de Produção (1:1) foi persistida no banco de dados local.
        </p>

        <div class="wiz-barcode-card">
          <span class="wiz-barcode-label">CÓDIGO DE BARRAS DA ORDEM</span>
          <div class="wiz-barcode-val-wrap">
            <Barcode :size="20" class="wiz-barcode-icon" aria-hidden="true" />
            <strong class="wiz-barcode-val">{{ createdOrdem.codigoBarras }}</strong>
          </div>
          <p class="wiz-barcode-hint">Imprima esta etiqueta para iniciar a bipagem no Almoxarifado.</p>
          
          <template v-if="createdOrdem.possuiCaixaTeste || formOrdem.possuiCaixaTeste">
            <div style="display: flex; gap: 0.5rem; justify-content: center; width: 100%;">
              <button
                type="button"
                class="btn-print-barcode"
                :disabled="loadingPdf"
                @click="imprimirEtiqueta('LOTE_PRINCIPAL')"
                title="Imprimir Etiqueta de Lote"
              >
                <Loader2 v-if="loadingPdf" :size="16" class="animate-spin" aria-hidden="true" />
                <Printer v-else :size="16" aria-hidden="true" />
                <span>{{ loadingPdf ? 'Gerando...' : 'Imprimir Lote' }}</span>
              </button>
              <button
                type="button"
                class="btn-print-barcode"
                :disabled="loadingPdf"
                @click="imprimirEtiqueta('CAIXA_TESTE')"
                title="Imprimir Etiqueta de Caixa Teste"
              >
                <Loader2 v-if="loadingPdf" :size="16" class="animate-spin" aria-hidden="true" />
                <Printer v-else :size="16" aria-hidden="true" />
                <span>{{ loadingPdf ? 'Gerando...' : 'Imprimir Caixa Teste' }}</span>
              </button>
            </div>
          </template>
          <template v-else>
            <button
              type="button"
              class="btn-print-barcode"
              :disabled="loadingPdf"
              @click="imprimirEtiqueta('LOTE_PRINCIPAL')"
              title="Imprimir Etiqueta de Código de Barras"
            >
              <Loader2 v-if="loadingPdf" :size="16" class="animate-spin" aria-hidden="true" />
              <Printer v-else :size="16" aria-hidden="true" />
              <span>{{ loadingPdf ? 'Gerando PDF...' : 'Imprimir Etiqueta' }}</span>
            </button>
          </template>
        </div>

        <div class="wiz-done-actions">
          <button type="button" class="btn-primary" @click="router.push('/dashboard/ordens')">
            <span>Visualizar Ordens</span>
          </button>
          <button type="button" class="btn-secondary" @click="resetWizard">
            <span>Iniciar Novo Cadastro</span>
          </button>
        </div>
      </div>

      <!-- PASSO 1: MODELO -->
      <div v-else-if="currentStep === 1" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <h2 class="wiz-panel-title">Passo 1: Cadastro do Novo Modelo</h2>
          <p class="wiz-panel-subtitle">Insira as informações do modelo a ser fabricado para o teste de produção.</p>
        </div>

        <div v-if="errorModelo" class="wiz-error-banner" role="alert">
          <AlertCircle :size="16" class="wiz-error-icon" aria-hidden="true" />
          <span class="wiz-error-text">{{ errorModelo }}</span>
        </div>

        <form @submit.prevent="submitModelo" class="wiz-form">
          <div class="form-grid">
            <div class="form-group">
              <label for="marcaId" class="form-label">Marca <span class="required">*</span></label>
              <select id="marcaId" v-model="formModelo.marcaId" class="form-select" required>
                <option value="">Selecione a Marca...</option>
                <option v-for="m in marcas" :key="m.id" :value="m.id">{{ m.nome }}</option>
              </select>
            </div>

            <div class="form-group">
              <label for="codigoProduto" class="form-label">Código do Produto (Referência) <span class="required">*</span></label>
              <input
                id="codigoProduto"
                type="text"
                v-model="formModelo.codigoProduto"
                placeholder="Ex: 502698"
                class="form-input"
                required
              />
            </div>

            <div class="form-group col-span-2">
              <label for="nome" class="form-label">Nome do Modelo <span class="required">*</span></label>
              <input
                id="nome"
                type="text"
                v-model="formModelo.nome"
                placeholder="Ex: AIR MAX EXCELLENCE"
                class="form-input"
                required
              />
            </div>

            <div class="form-group col-span-2">
              <label for="temporada" class="form-label">Temporada</label>
              <input
                id="temporada"
                type="text"
                v-model="formModelo.temporada"
                placeholder="Ex: SS26"
                class="form-input"
              />
            </div>
          </div>

          <div class="wiz-footer-actions">
            <button type="button" class="btn-secondary" @click="router.push('/dashboard/modelos')">
              <span>Cancelar</span>
            </button>
            <button type="submit" class="btn-primary" :disabled="loadingModelo">
              <Loader2 v-if="loadingModelo" :size="16" class="wiz-spinner" aria-hidden="true" />
              <span>Salvar e Avançar</span>
              <ArrowRight v-if="!loadingModelo" :size="16" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>

      <!-- PASSO 2: ROTA -->
      <div v-else-if="currentStep === 2" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="wiz-panel-title">Passo 2: Construtor de Rota de Produção</h2>
              <p class="wiz-panel-subtitle">
                Modelo: <strong class="text-slate-900">{{ createdModeloName }}</strong> ({{ createdModeloCode }}).
                Arraste os blocos flutuantes para desenhar o fluxo de fábrica.
              </p>
            </div>
          </div>
        </div>

        <!-- Renderiza o componente RouteBuilder no modo Wizard -->
        <div class="wiz-route-builder-container">
          <RouteBuilder
            ref="routeBuilderRef"
            :modeloId="createdModeloId"
            :isWizardMode="true"
            @rota-salva="onRotaSalva"
          />
        </div>

        <div class="wiz-footer-actions wiz-footer-actions--border">
          <button type="button" class="btn-secondary" @click="currentStep = 1" :disabled="loadingRota">
            <ArrowLeft :size="16" aria-hidden="true" />
            <span>Voltar ao Modelo</span>
          </button>
          <button type="button" class="btn-primary" @click="triggerSaveRota" :disabled="loadingRota">
            <Loader2 v-if="loadingRota" :size="16" class="wiz-spinner" aria-hidden="true" />
            <span>Salvar Rota e Avançar</span>
            <ArrowRight v-if="!loadingRota" :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- PASSO 3: ORDEM -->
      <div v-else-if="currentStep === 3" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <h2 class="wiz-panel-title">Passo 3: Geração da Ordem de Teste</h2>
          <p class="wiz-panel-subtitle">Configure as opções PCP da fábrica para persistir o teste do modelo.</p>
        </div>

        <div v-if="errorOrdem" class="wiz-error-banner" role="alert">
          <AlertCircle :size="16" class="wiz-error-icon" aria-hidden="true" />
          <span class="wiz-error-text">{{ errorOrdem }}</span>
        </div>

        <!-- Resumo do Modelo & Rota Mapeada -->
        <div class="wiz-summary-section">
          <h3 class="wiz-summary-title">Resumo do Teste</h3>
          <div class="wiz-summary-grid">
            <div class="wiz-sum-item">
              <span class="wiz-sum-label">Modelo:</span>
              <strong class="wiz-sum-val">{{ createdModeloName }}</strong>
            </div>
            <div class="wiz-sum-item">
              <span class="wiz-sum-label">Código:</span>
              <strong class="wiz-sum-val">{{ createdModeloCode }}</strong>
            </div>
            <div class="wiz-sum-item col-span-2">
              <span class="wiz-sum-label">Status da Rota:</span>
              <strong class="wiz-sum-val text-green-700">Mapeada no Banco Local</strong>
            </div>
          </div>
        </div>

        <form @submit.prevent="submitOrdem" class="wiz-form">
          <div class="form-grid">
            <div class="form-group col-span-2">
              <label for="plantaId" class="form-label">Planta de Fabricação <span class="required">*</span></label>
              <select id="plantaId" v-model="formOrdem.plantaId" class="wiz-select" required>
                <option v-for="p in plantas" :key="p.id" :value="p.id">
                  {{ p.nome }} {{ p.cidade ? `(${p.cidade})` : '' }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="prioridadePcp" class="form-label">Prioridade PCP <span class="required">*</span></label>
              <select id="prioridadePcp" v-model="formOrdem.prioridadePcp" class="wiz-select" required>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>

            <div class="form-group flex items-end">
              <label class="wiz-checkbox-container">
                <input type="checkbox" v-model="formOrdem.possuiCaixaTeste" class="wiz-checkbox-input" />
                <span class="wiz-checkbox-label">Possui Caixa Teste (Amostra Qualidade)</span>
              </label>
            </div>

            <div class="form-group col-span-2">
              <label for="observacoes" class="form-label">Observações da Ordem</label>
              <textarea
                id="observacoes"
                v-model="formOrdem.observacoes"
                placeholder="Insira notas sobre a liberação de materiais ou testes..."
                class="form-textarea"
                rows="3"
              ></textarea>
            </div>
          </div>

          <div class="wiz-footer-actions">
            <button type="button" class="btn-secondary" @click="currentStep = 2" :disabled="loadingOrdem">
              <ArrowLeft :size="16" aria-hidden="true" />
              <span>Voltar à Rota</span>
            </button>
            <button type="submit" class="btn-primary" :disabled="loadingOrdem">
              <Loader2 v-if="loadingOrdem" :size="16" class="wiz-spinner" aria-hidden="true" />
              <span>Gerar Ordem de Teste</span>
              <CheckCircle v-if="!loadingOrdem" :size="16" aria-hidden="true" />
            </button>
          </div>
      </form>
    </div>
  </div>

  <!-- Bloco de impressão exclusivo (visível apenas ao imprimir) -->
  </div>
</template>

<style scoped>
.wiz-root {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 72rem;
  margin: 0 auto;
}

/* Stepper Visual */
.wiz-stepper-header {
  display: flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.125rem 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.wiz-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.wiz-step--active {
  opacity: 1;
}
.wiz-step--completed {
  opacity: 0.9;
  color: #1e3a8a;
}
.wiz-step-bubble {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-weight: 700;
  transition: all 0.25s;
}
.wiz-step--active .wiz-step-bubble {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}
.wiz-step--completed .wiz-step-bubble {
  background: #1e3a8a;
  border-color: #1e3a8a;
  color: #ffffff;
}
.wiz-step-info {
  display: flex;
  flex-direction: column;
}
.wiz-step-number {
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}
.wiz-step--active .wiz-step-number {
  color: #3b82f6;
}
.wiz-step-name {
  font-size: 0.875rem;
  font-weight: 800;
  color: #0f172a;
}
.wiz-step-connector {
  flex: 1;
  height: 2px;
  background: #e2e8f0;
  margin: 0 1.5rem;
  transition: background 0.3s;
}
.wiz-step-connector--active {
  background: #1e3a8a;
}

/* Card */
.wiz-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.wiz-step-panel {
  display: flex;
  flex-direction: column;
}

.wiz-panel-header {
  padding: 1.5rem;
  border-bottom: 1px solid #f1f5f9;
}
.wiz-panel-title {
  font-size: 1.125rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.wiz-panel-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.25rem 0 0;
}

/* Loading */
.wiz-loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 0.75rem;
  color: #64748b;
  font-size: 0.875rem;
}
.wiz-spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Form layout */
.wiz-form {
  padding: 1.5rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}
.col-span-2 {
  grid-column: span 2 / span 2;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.form-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #475569;
}
.required {
  color: #dc2626;
}

.form-input, .form-select, .wiz-select, .form-textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus, .form-select:focus, .wiz-select:focus, .form-textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.wiz-checkbox-container {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #334155;
  padding: 0.5rem 0;
}
.wiz-checkbox-input {
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  border: 1px solid #cbd5e1;
  cursor: pointer;
}

/* Summary */
.wiz-summary-section {
  margin: 1.5rem 1.5rem 0 1.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
}
.wiz-summary-title {
  font-size: 0.8125rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #475569;
  margin: 0 0 0.75rem 0;
}
.wiz-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.wiz-sum-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.wiz-sum-label {
  color: #64748b;
  min-width: 6rem;
}
.wiz-sum-val {
  color: #0f172a;
}

/* Actions footer */
.wiz-footer-actions {
  display: flex;
  justify-content: space-between;
  padding-top: 1.25rem;
  border-top: 1px solid #f1f5f9;
}
.wiz-footer-actions--border {
  border-top: 1px solid #e2e8f0;
  padding: 1.25rem 1.5rem;
  background: #f8fafc;
}

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.btn-primary {
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  color: #ffffff;
  border: none;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.15);
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(29, 78, 216, 0.25);
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #ffffff;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.btn-secondary:hover:not(:disabled) {
  background: #f8fafc;
  color: #0f172a;
}

/* Error Banner */
.wiz-error-banner {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 1.5rem 1.5rem 0 1.5rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  color: #b91c1c;
}
.wiz-error-icon { flex-shrink: 0; }
.wiz-error-text { font-size: 0.8125rem; font-weight: 600; }

/* Route builder container alignment */
.wiz-route-builder-container {
  padding: 0;
  background: #f8fafc;
}

/* Conclusão */
.wiz-done-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4rem 2rem;
  max-width: 32rem;
  margin: 0 auto;
}
.wiz-done-icon-wrap {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: #dcfce7;
  color: #15803d;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
}
.wiz-done-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
}
.wiz-done-desc {
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.6;
  margin-bottom: 2rem;
}

.wiz-barcode-card {
  width: 100%;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wiz-barcode-label {
  font-size: 0.6875rem;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}
.wiz-barcode-val-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #1e3a8a;
  background: #ffffff;
  border: 1.5px solid #bfdbfe;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 8px rgba(30, 58, 138, 0.05);
}
.wiz-barcode-val {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 1.25rem;
  font-weight: 800;
}
.wiz-barcode-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.75rem;
  margin-bottom: 0;
}

.wiz-done-actions {
  display: flex;
  gap: 1rem;
  width: 100%;
}
.wiz-done-actions button {
  flex: 1;
}

/* Toasts */
.wiz-toasts {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 9999;
}
.wiz-toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-size: 0.8125rem;
  font-weight: 700;
  color: #ffffff;
  animation: slideIn 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.wiz-toast--success {
  background: #15803d;
}
.wiz-toast--error {
  background: #b91c1c;
}
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Print Specific Button */
.btn-print-barcode {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e3a8a;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.btn-print-barcode:hover {
  background: #dbeafe;
  color: #1d4ed8;
}
</style>
