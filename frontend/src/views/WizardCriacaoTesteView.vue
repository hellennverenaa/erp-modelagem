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
  Printer,
  Plus,
  Trash2,
  Scissors,
  Search
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

interface CatalogoItem {
  id: string
  numero: string
  nome: string
  codigoOriginal: string | null
}

interface MaquinaOpcao {
  id: string
  label: string
  valor: string
}

interface PecaSelecionada {
  id: string
  numero: string
  nome: string
  codigoOriginal: string | null
  setorCorteOpcaoId: string
}

// ─── Navegação e Roteamento ──────────────────────────────────────────────────
const router = useRouter()

// ─── Estado do Stepper ───────────────────────────────────────────────────────
// 1: Modelo | 2: Peças | 3: Rota | 4: Ordem
const currentStep = ref(1)

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

// Passo 2: Peças Técnicas
const pecasSelecionadas = ref<PecaSelecionada[]>([])
const catalogoPecas = ref<CatalogoItem[]>([])
const maquinasCorte = ref<MaquinaOpcao[]>([])
const searchPecaText = ref('')
const showAutocomplete = ref(false)
const loadingStep2 = ref(false)

// Passo 3: Rota
const routeBuilderRef = ref<any>(null)
const loadingRota = ref(false)

// Passo 4: Ordem
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
    await loadStep2Data()
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

// Passo 2: Carregar Catálogo e Opções de Máquinas
async function loadStep2Data() {
  loadingStep2.value = true
  try {
    const [catRes, maqRes] = await Promise.all([
      api.get<CatalogoItem[]>('/catalogo-pecas'),
      api.get<any[]>('/config/opcoes/subsetor_corte').catch(() =>
        api.get<any[]>('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } })
      )
    ])
    catalogoPecas.value = catRes.data || []
    maquinasCorte.value = (maqRes.data || []).map((m: any) => ({
      id: m.id,
      label: m.label || m.valor,
      valor: m.valor
    }))
  } catch (err) {
    console.error('[loadStep2Data] Erro ao buscar catálogo/máquinas:', err)
    addToast('error', 'Erro ao carregar catálogo de peças e máquinas.')
  } finally {
    loadingStep2.value = false
  }
}

const filteredCatalogo = computed(() => {
  const q = searchPecaText.value.trim().toLowerCase()
  if (!q) return catalogoPecas.value.slice(0, 12)
  return catalogoPecas.value.filter(item =>
    item.numero.toLowerCase().includes(q) ||
    item.nome.toLowerCase().includes(q) ||
    (item.codigoOriginal && item.codigoOriginal.toLowerCase().includes(q))
  ).slice(0, 15)
})

function addPecaFromCatalogo(item: CatalogoItem) {
  const jaExiste = pecasSelecionadas.value.some(p => p.id === item.id)
  if (jaExiste) {
    addToast('error', `A peça ${item.numero} - ${item.nome} já foi adicionada.`)
    return
  }

  const defaultMaquinaId = maquinasCorte.value[0]?.id || ''

  pecasSelecionadas.value.push({
    id: item.id,
    numero: item.numero,
    nome: item.nome,
    codigoOriginal: item.codigoOriginal,
    setorCorteOpcaoId: defaultMaquinaId
  })

  searchPecaText.value = ''
  showAutocomplete.value = false
}

function removePeca(index: number) {
  pecasSelecionadas.value.splice(index, 1)
}

async function submitPecasAndAdvance() {
  if (pecasSelecionadas.value.length === 0) {
    addToast('error', 'Adicione pelo menos uma peça ao modelo antes de avançar.')
    return
  }

  loadingModelo.value = true
  try {
    if (createdModeloId.value) {
      await api.post(`/pecas/modelo/${createdModeloId.value}`, {
        pecas: pecasSelecionadas.value
      })
    }
    addToast('success', `${pecasSelecionadas.value.length} peças vinculadas ao modelo.`)
    currentStep.value = 3 // Avança para Construtor de Rota
  } catch (err: any) {
    console.error('[submitPecasAndAdvance] Erro:', err)
    addToast('error', 'Erro ao salvar peças do modelo.')
  } finally {
    loadingModelo.value = false
  }
}

// Salvar Rota (Passo 3 -> 4)
function triggerSaveRota() {
  if (routeBuilderRef.value) {
    loadingRota.value = true
    routeBuilderRef.value.salvarRota()
  }
}

function onRotaSalva() {
  loadingRota.value = false
  currentStep.value = 4
}

// Salvar Ordem (Passo 4 -> Conclusão)
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
      observacoes: formOrdem.value.observacoes.trim() || null,
      pecas: pecasSelecionadas.value
    })

    createdOrdem.value = response.data.lote || response.data
    addToast('success', 'Ordem de teste gerada com sucesso!')
  } catch (err: any) {
    console.error(err)
    errorOrdem.value = err.response?.data?.error || 'Erro ao gerar ordem de teste.'
  } finally {
    loadingOrdem.value = false
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
  pecasSelecionadas.value = []
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

    <!-- ── STEPPER VISUAL (4 PASSOS) ── -->
    <div class="wiz-stepper-header" v-if="!createdOrdem">
      <!-- Passo 1: Modelo -->
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

      <!-- Passo 2: Peças -->
      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 2, 'wiz-step--completed': currentStep > 2 }">
        <div class="wiz-step-bubble">
          <Scissors v-if="currentStep <= 2" :size="16" aria-hidden="true" />
          <CheckCircle v-else :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 2</span>
          <span class="wiz-step-name">Peças</span>
        </div>
      </div>
      <div class="wiz-step-connector" :class="{ 'wiz-step-connector--active': currentStep > 2 }"></div>
      
      <!-- Passo 3: Rota -->
      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 3, 'wiz-step--completed': currentStep > 3 }">
        <div class="wiz-step-bubble">
          <ListOrdered v-if="currentStep <= 3" :size="16" aria-hidden="true" />
          <CheckCircle v-else :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 3</span>
          <span class="wiz-step-name">Rota</span>
        </div>
      </div>
      <div class="wiz-step-connector" :class="{ 'wiz-step-connector--active': currentStep > 3 }"></div>

      <!-- Passo 4: Ordem -->
      <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 4 }">
        <div class="wiz-step-bubble">
          <ClipboardCheck :size="16" aria-hidden="true" />
        </div>
        <div class="wiz-step-info">
          <span class="wiz-step-number">Passo 4</span>
          <span class="wiz-step-name">Ordem</span>
        </div>
      </div>
    </div>

    <!-- ── LOADING INICIAL ── -->
    <div v-if="loadingInit" class="wiz-loading-block">
      <Loader2 :size="32" class="wiz-spinner" aria-hidden="true" />
      <span>Carregando dados necessários...</span>
    </div>

    <!-- ── FLOW STEPS CONTROL ── -->
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
              <span>Salvar e Avançar para Peças</span>
              <ArrowRight v-if="!loadingModelo" :size="16" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>

      <!-- PASSO 2 [NOVO]: CONSTRUÇÃO DE PEÇAS -->
      <div v-else-if="currentStep === 2" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <h2 class="wiz-panel-title">Passo 2: Construção de Peças do Modelo</h2>
          <p class="wiz-panel-subtitle">
            Modelo: <strong class="text-slate-900">{{ createdModeloName }}</strong> ({{ createdModeloCode }}).
            Adicione as peças do catálogo e defina a máquina de corte de cada uma.
          </p>
        </div>

        <div class="wiz-form">
          <!-- Autocomplete do Catálogo de Peças -->
          <div class="pecas-autocomplete-container">
            <label class="form-label">Adicionar Peça do Catálogo</label>
            <div class="autocomplete-wrap">
              <Search :size="16" class="ac-icon" />
              <input
                type="text"
                v-model="searchPecaText"
                @focus="showAutocomplete = true"
                placeholder="Buscar por número (ex: 026) ou nome (ex: GÁSPEA)..."
                class="ac-input"
              />
            </div>

            <!-- Dropdown de Peças -->
            <div v-if="showAutocomplete && filteredCatalogo.length > 0" class="ac-dropdown">
              <div
                v-for="item in filteredCatalogo"
                :key="item.id"
                class="ac-item"
                @mousedown.prevent="addPecaFromCatalogo(item)"
              >
                <span class="ac-badge">{{ item.numero }}</span>
                <span class="ac-name">{{ item.nome }}</span>
                <span v-if="item.codigoOriginal" class="ac-ref">Ref: {{ item.codigoOriginal }}</span>
              </div>
            </div>
          </div>

          <!-- Tabela de Peças Selecionadas -->
          <div class="pecas-selected-list">
            <div class="pecas-list-header">
              <span class="pecas-list-title">Peças Atribuídas ao Modelo ({{ pecasSelecionadas.length }})</span>
            </div>

            <div v-if="pecasSelecionadas.length === 0" class="pecas-empty">
              <Scissors :size="32" class="text-slate-400" />
              <p>Nenhuma peça adicionada ainda. Utilize a busca acima para adicionar peças ao modelo.</p>
            </div>

            <div v-else class="pecas-table-wrap">
              <table class="pecas-table">
                <thead>
                  <tr>
                    <th style="width: 80px; text-align: center;">Número</th>
                    <th>Nome da Peça Técnica</th>
                    <th>Máquina de Corte Destino</th>
                    <th style="width: 60px; text-align: center;">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, idx) in pecasSelecionadas" :key="p.id" class="peca-row">
                    <td style="text-align: center;">
                      <span class="peca-num-badge">{{ p.numero }}</span>
                    </td>
                    <td>
                      <strong class="text-slate-900">{{ p.nome }}</strong>
                    </td>
                    <td>
                      <select v-model="p.setorCorteOpcaoId" class="maquina-select">
                        <option v-for="m in maquinasCorte" :key="m.id" :value="m.id">
                          {{ m.label }}
                        </option>
                      </select>
                    </td>
                    <td style="text-align: center;">
                      <button
                        type="button"
                        class="btn-remove-peca"
                        @click="removePeca(idx)"
                        title="Remover peça"
                      >
                        <Trash2 :size="14" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="wiz-footer-actions wiz-footer-actions--border" style="margin-top: 1.5rem;">
            <button type="button" class="btn-secondary" @click="currentStep = 1">
              <ArrowLeft :size="16" aria-hidden="true" />
              <span>Voltar ao Modelo</span>
            </button>
            <button type="button" class="btn-primary" @click="submitPecasAndAdvance" :disabled="loadingModelo">
              <Loader2 v-if="loadingModelo" :size="16" class="wiz-spinner" aria-hidden="true" />
              <span>Salvar Peças e Avançar para Rota</span>
              <ArrowRight v-if="!loadingModelo" :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- PASSO 3: ROTA DE PRODUÇÃO (antigo Passo 2) -->
      <div v-else-if="currentStep === 3" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="wiz-panel-title">Passo 3: Construtor de Rota de Produção</h2>
              <p class="wiz-panel-subtitle">
                Modelo: <strong class="text-slate-900">{{ createdModeloName }}</strong> ({{ createdModeloCode }}).
                Arraste os blocos flutuantes para desenhar o fluxo de fábrica.
              </p>
            </div>
          </div>
        </div>

        <div class="wiz-route-builder-container">
          <RouteBuilder
            ref="routeBuilderRef"
            :modeloId="createdModeloId"
            :isWizardMode="true"
            @rota-salva="onRotaSalva"
          />
        </div>

        <div class="wiz-footer-actions wiz-footer-actions--border">
          <button type="button" class="btn-secondary" @click="currentStep = 2" :disabled="loadingRota">
            <ArrowLeft :size="16" aria-hidden="true" />
            <span>Voltar às Peças</span>
          </button>
          <button type="button" class="btn-primary" @click="triggerSaveRota" :disabled="loadingRota">
            <Loader2 v-if="loadingRota" :size="16" class="wiz-spinner" aria-hidden="true" />
            <span>Salvar Rota e Avançar</span>
            <ArrowRight v-if="!loadingRota" :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- PASSO 4: GERAÇÃO DA ORDEM PCP (antigo Passo 3) -->
      <div v-else-if="currentStep === 4" class="wiz-step-panel">
        <div class="wiz-panel-header">
          <h2 class="wiz-panel-title">Passo 4: Geração da Ordem de Teste</h2>
          <p class="wiz-panel-subtitle">Configure as opções PCP da fábrica para persistir o teste do modelo.</p>
        </div>

        <div v-if="errorOrdem" class="wiz-error-banner" role="alert">
          <AlertCircle :size="16" class="wiz-error-icon" aria-hidden="true" />
          <span class="wiz-error-text">{{ errorOrdem }}</span>
        </div>

        <!-- Resumo do Teste -->
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
            <div class="wiz-sum-item">
              <span class="wiz-sum-label">Peças Cadastradas:</span>
              <strong class="wiz-sum-val">{{ pecasSelecionadas.length }} Peças</strong>
            </div>
            <div class="wiz-sum-item">
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
            <button type="button" class="btn-secondary" @click="currentStep = 3" :disabled="loadingOrdem">
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

/* Stepper Header */
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
  color: #0f172a;
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
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
  box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.12);
}
.wiz-step--completed .wiz-step-bubble {
  background: #0f172a;
  border-color: #0f172a;
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
  color: #0f172a;
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
  margin: 0 1rem;
  transition: background 0.3s;
}
.wiz-step-connector--active {
  background: #0f172a;
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
  color: #0f172a;
  font-weight: 900;
}

.form-input, .form-select, .wiz-select, .form-textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus, .form-select:focus, .wiz-select:focus, .form-textarea:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.12);
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

/* Step 2 Autocomplete & List */
.pecas-autocomplete-container {
  position: relative;
  margin-bottom: 1.5rem;
}
.autocomplete-wrap {
  position: relative;
}
.ac-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
}
.ac-input {
  width: 100%;
  padding: 0.625rem 0.875rem 0.625rem 2.25rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  outline: none;
}
.ac-input:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1);
}
.ac-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  max-height: 16rem;
  overflow-y: auto;
  z-index: 30;
  margin-top: 0.25rem;
}
.ac-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.875rem;
}
.ac-item:hover {
  background: #f8fafc;
}
.ac-badge {
  padding: 0.2rem 0.5rem;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  font-family: monospace;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.ac-name {
  font-weight: 700;
  color: #0f172a;
}
.ac-ref {
  margin-left: auto;
  font-size: 0.75rem;
  color: #64748b;
  font-family: monospace;
}

.pecas-selected-list {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
}
.pecas-list-header {
  margin-bottom: 0.75rem;
}
.pecas-list-title {
  font-size: 0.8125rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #475569;
}
.pecas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  color: #64748b;
  font-size: 0.875rem;
  text-align: center;
}
.pecas-table-wrap {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  overflow: hidden;
}
.pecas-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.pecas-table th {
  background: #f1f5f9;
  padding: 0.625rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}
.peca-row td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}
.peca-num-badge {
  padding: 0.2rem 0.5rem;
  background: #0f172a;
  color: #ffffff;
  font-weight: 800;
  font-family: monospace;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.maquina-select {
  width: 100%;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  outline: none;
  background: #ffffff;
  color: #0f172a;
}
.btn-remove-peca {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}
.btn-remove-peca:hover {
  color: #0f172a;
  background: #e2e8f0;
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

/* Buttons */
.btn-primary {
  background: #0f172a;
  color: #ffffff;
  border: none;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  border-radius: 0.5rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.btn-primary:hover {
  background: #1e293b;
}
.btn-secondary {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.btn-print-barcode {
  background: #0f172a;
  color: #ffffff;
  border: none;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  border-radius: 0.375rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

/* Done block */
.wiz-done-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 2rem;
}
.wiz-done-icon-wrap {
  width: 4rem;
  height: 4rem;
  background: #0f172a;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
.wiz-done-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.wiz-done-desc {
  font-size: 0.875rem;
  color: #64748b;
  max-width: 28rem;
  margin: 0.5rem 0 1.5rem;
}
.wiz-barcode-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 24rem;
  width: 100%;
  margin-bottom: 1.5rem;
}
.wiz-barcode-label {
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #64748b;
}
.wiz-barcode-val-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.wiz-barcode-val {
  font-family: monospace;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}
.wiz-barcode-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}
.wiz-done-actions {
  display: flex;
  gap: 0.75rem;
}

/* Toast */
.wiz-toasts {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.wiz-toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.8125rem;
  font-weight: 600;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
</style>
