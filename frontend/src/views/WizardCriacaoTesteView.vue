<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Layers,
  ListOrdered,
  Loader2,
  Printer,
  Scissors,
  Search,
  Trash2,
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'
import BrandManagerModal from '../components/BrandManagerModal.vue'
import RouteBuilder from '../components/RouteBuilder.vue'

interface Marca {
  id: string
  nome: string
  ativo: boolean
}

interface Planta {
  id: string
  nome: string
  cidade: string | null
}

interface Modelo {
  id: string
  nome: string
  codigoProduto: string
  marcaId: string
  marca?: Marca
  dataCorte: string | null
  pecas?: any[]
}

interface OrdemTeste {
  id: string
  modeloId: string
  plantaId: string
  codigoBarras: string
  status: string
  dataInicio?: string
  prioridadePcp: string
  possuiCaixaTeste: boolean | null
  observacoes?: string | null
  modelo?: Modelo
  planta?: Planta
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
  id?: string
  catalogoPecaId: string
  numero: string
  nome: string
  codigoOriginal: string | null
  setorCorteOpcaoId: string
}

interface RotaSalvaPayload {
  rota: Array<{
    setorId: string
    ordem: number
    obrigatorio: boolean
    tipoExecucao: 'SEQUENCIAL' | 'PARALELO'
    bipagemApenasSaida: boolean
  }>
  slasPorSetor: Record<string, number>
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

const router = useRouter()
const podeCriarPcp = computed(() => authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE'))
const podeConfigurarModelagem = computed(() =>
  authStore.hasPermission('CONFIGURAR_MODELO_ORDEM') && authStore.hasPermission('EDITAR_ROTA'),
)
const temAcessoAosDoisFluxos = computed(() => podeCriarPcp.value && podeConfigurarModelagem.value)

const activeMode = ref<'pcp' | 'modelagem'>(podeCriarPcp.value ? 'pcp' : 'modelagem')
const currentStep = ref(1)
const loadingInit = ref(true)
const loadingModelo = ref(false)
const loadingOrdem = ref(false)
const loadingPecas = ref(false)
const loadingRota = ref(false)
const loadingPdf = ref(false)
const errorModelo = ref('')
const errorOrdem = ref('')
const errorPecas = ref('')
const errorRota = ref('')

const marcas = ref<Marca[]>([])
const selectedInactiveBrandName = ref('')
const plantas = ref<Planta[]>([])
const modelosDisponiveis = ref<Modelo[]>([])
const ordensPendentes = ref<OrdemTeste[]>([])
const selectedExistingModelId = ref('')
const activeModelId = ref('')
const selectedOrder = ref<OrdemTeste | null>(null)
const completedOrder = ref<OrdemTeste | null>(null)
const showBrandManager = ref(false)

const formModelo = ref({
  nome: '',
  codigoProduto: '',
  marcaId: '',
  dataCorte: '',
})
const formOrdem = ref({
  plantaId: '',
  prioridadePcp: 'MEDIA',
  observacoes: '',
})

const catalogoPecas = ref<CatalogoItem[]>([])
const maquinasCorte = ref<MaquinaOpcao[]>([])
const pecasSelecionadas = ref<PecaSelecionada[]>([])
const loadingCatalogo = ref(false)
const loadingMaquinas = ref(false)
const catalogoCarregado = ref(false)
const maquinasCarregadas = ref(false)
const errorCatalogo = ref('')
const errorMaquinas = ref('')
const searchPecaText = ref('')
const showAutocomplete = ref(false)
const autocompleteIndex = ref(0)
const autocompleteContainerRef = ref<HTMLElement | null>(null)
const caixaTeste = ref<boolean | null>(null)
const routeBuilderRef = ref<any>(null)
const routeSalva = ref<RotaSalvaPayload | null>(null)

const toasts = ref<Toast[]>([])
let toastId = 0

const plantaUsuarioId = computed(() => authStore.user.value?.plantaId || '')
const plantasPermitidas = computed(() => plantas.value.filter((planta) =>
  authStore.hasPermission('ACESSAR_TODAS_PLANTAS') || planta.id === plantaUsuarioId.value,
))
const filteredCatalogo = computed(() => {
  const query = searchPecaText.value.trim().toLocaleLowerCase('pt-BR')
  const itens = !query
    ? catalogoPecas.value
    : catalogoPecas.value.filter((item) =>
      item.numero.toLocaleLowerCase('pt-BR').includes(query) ||
      item.nome.toLocaleLowerCase('pt-BR').includes(query) ||
      (item.codigoOriginal || '').toLocaleLowerCase('pt-BR').includes(query),
    )
  return itens.filter((item) => !pecasSelecionadas.value.some((peca) => peca.catalogoPecaId === item.id)).slice(0, 15)
})

function maquinaDaPeca(peca: PecaSelecionada): string {
  const opcao = maquinasCorte.value.find((item) => item.id === peca.setorCorteOpcaoId)
  return (opcao?.valor || opcao?.label || '').trim().toLocaleUpperCase('pt-BR')
}

const maquinasUsadas = computed(() => {
  const valores = new Set(pecasSelecionadas.value.map(maquinaDaPeca))
  const usa = (valor: string) => [...valores].some((item) => item === valor || item.endsWith(`_${valor}`))
  return {
    lectra: usa('LECTRA'),
    ponte: usa('PONTE'),
    atom: usa('ATOM'),
    cn: usa('CN'),
    couro: usa('COURO'),
    laser: usa('LASER'),
  }
})

const routeBuilderKey = computed(() => `${selectedOrder.value?.modeloId || 'sem-modelo'}:${selectedOrder.value?.plantaId || 'sem-planta'}`)

function toast(type: Toast['type'], message: string) {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  setTimeout(() => { toasts.value = toasts.value.filter((item) => item.id !== id) }, 4500)
}

function ordenarMarcasDisponiveis() {
  marcas.value.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function upsertMarcaDisponivel(marca: Marca) {
  if (!marca.ativo) return
  const index = marcas.value.findIndex((item) => item.id === marca.id)
  if (index === -1) marcas.value.push(marca)
  else marcas.value[index] = marca
  ordenarMarcasDisponiveis()
}

function marcaCriada(marca: Marca) {
  upsertMarcaDisponivel(marca)
  if (!activeModelId.value) {
    formModelo.value.marcaId = marca.id
    selectedInactiveBrandName.value = ''
  }
}

function marcaAtualizada(marca: Marca) {
  if (marca.ativo) {
    upsertMarcaDisponivel(marca)
    if (formModelo.value.marcaId === marca.id) selectedInactiveBrandName.value = ''
    return
  }

  marcas.value = marcas.value.filter((item) => item.id !== marca.id)
  if (formModelo.value.marcaId !== marca.id) return

  if (activeModelId.value) {
    // A marca não pode ser escolhida em novos modelos, mas permanece legível
    // enquanto o formulário de um modelo existente estiver bloqueado.
    selectedInactiveBrandName.value = marca.nome
  } else {
    formModelo.value.marcaId = ''
    selectedInactiveBrandName.value = marca.nome
  }
}

function dateOnlyForInput(value?: string | null): string {
  if (!value) return ''
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDate) return isoDate[1]
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function carregarModelosDisponiveis() {
  if (!podeCriarPcp.value) return
  try {
    const { data } = await api.get<Modelo[]>('/admin/modelos')
    modelosDisponiveis.value = data || []
  } catch {
    toast('error', 'Não foi possível carregar os modelos sem ordem para retomada.')
  }
}

async function carregarOrdensPendentes() {
  if (!podeConfigurarModelagem.value) return
  try {
    const { data } = await api.get<OrdemTeste[]>('/lotes')
    ordensPendentes.value = (data || [])
      .filter((ordem) => ordem.status === 'AGUARDANDO_MODELAGEM')
      .sort((a, b) => new Date(a.dataInicio || '').getTime() - new Date(b.dataInicio || '').getTime())
  } catch {
    toast('error', 'Não foi possível carregar a fila de ordens aguardando Modelagem.')
  }
}

async function carregarDadosIniciais() {
  const tarefas: Promise<void>[] = []
  if (podeCriarPcp.value) {
    tarefas.push((async () => {
      const { data } = await api.get<Marca[]>('/admin/marcas')
      marcas.value = data || []
    })())
    tarefas.push((async () => {
      const { data } = await api.get<Planta[]>('/admin/plantas')
      plantas.value = data || []
      const primeira = plantasPermitidas.value[0]
      if (!formOrdem.value.plantaId && primeira) formOrdem.value.plantaId = primeira.id
    })())
    tarefas.push(carregarModelosDisponiveis())
  }
  if (podeConfigurarModelagem.value) tarefas.push(carregarOrdensPendentes())
  const resultados = await Promise.allSettled(tarefas)
  if (resultados.some((item) => item.status === 'rejected')) toast('error', 'Alguns dados iniciais não puderam ser carregados.')
  loadingInit.value = false
}

async function selecionarModeloExistente() {
  if (!selectedExistingModelId.value) return
  loadingModelo.value = true
  try {
    const { data } = await api.get<Modelo>(`/admin/modelos/${selectedExistingModelId.value}`)
    activeModelId.value = data.id
    formModelo.value = {
      nome: data.nome,
      codigoProduto: data.codigoProduto,
      marcaId: data.marcaId || data.marca?.id || '',
      dataCorte: dateOnlyForInput(data.dataCorte),
    }
    selectedInactiveBrandName.value = data.marca?.nome && !marcas.value.some((marca) => marca.id === data.marca?.id)
      ? data.marca.nome
      : ''
    errorModelo.value = ''
    currentStep.value = 1
    toast('success', `Modelo ${data.codigoProduto} carregado. Avance para informar a previsão de corte e criar a ordem.`)
  } catch (error: any) {
    toast('error', error.response?.data?.error || 'Não foi possível carregar o modelo selecionado.')
  } finally {
    loadingModelo.value = false
  }
}

async function submitModelo() {
  if (!podeCriarPcp.value) return
  const nome = formModelo.value.nome.trim()
  const codigoProduto = formModelo.value.codigoProduto.trim()
  if (!nome || !codigoProduto || !formModelo.value.marcaId) {
    errorModelo.value = 'Preencha marca, código e nome do modelo.'
    return
  }
  if (!/^\d+$/.test(codigoProduto)) {
    errorModelo.value = 'O código do produto deve conter somente números.'
    return
  }

  loadingModelo.value = true
  errorModelo.value = ''
  try {
    if (!activeModelId.value) {
      const { data } = await api.post('/admin/modelos/rascunho', {
        marcaId: formModelo.value.marcaId,
        codigoProduto,
        nome,
      })
      activeModelId.value = data.modelo.id
    }
    currentStep.value = 2
    await carregarModelosDisponiveis()
    toast('success', 'Modelo salvo. Informe a previsão de corte para criar a ordem de teste.')
  } catch (error: any) {
    errorModelo.value = error.response?.data?.error || 'Não foi possível salvar o modelo.'
  } finally {
    loadingModelo.value = false
  }
}

function sanitizeCodigoProduto(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value.replace(/\D/g, '').slice(0, 50)
  formModelo.value.codigoProduto = value
  input.value = value
}

async function submitOrdem() {
  if (!podeCriarPcp.value) return
  if (!activeModelId.value) {
    errorOrdem.value = 'Salve ou selecione o modelo antes de criar a ordem.'
    currentStep.value = 1
    return
  }
  if (!formOrdem.value.plantaId) {
    errorOrdem.value = 'Selecione a planta que receberá o teste.'
    return
  }
  if (!formModelo.value.dataCorte) {
    errorOrdem.value = 'Informe a previsão de corte do modelo.'
    return
  }

  loadingOrdem.value = true
  errorOrdem.value = ''
  try {
    const { data } = await api.post('/ordens-teste/wizard/ordem', {
      modeloId: activeModelId.value,
      plantaId: formOrdem.value.plantaId,
      prioridadePcp: formOrdem.value.prioridadePcp,
      dataCorte: formModelo.value.dataCorte,
      observacoes: formOrdem.value.observacoes.trim() || null,
    })
    completedOrder.value = {
      ...data.ordem,
      modeloId: activeModelId.value,
      plantaId: formOrdem.value.plantaId,
      modelo: {
        id: activeModelId.value,
        nome: formModelo.value.nome,
        codigoProduto: formModelo.value.codigoProduto,
        marcaId: formModelo.value.marcaId,
        dataCorte: formModelo.value.dataCorte,
      },
    }
    await Promise.all([carregarOrdensPendentes(), carregarModelosDisponiveis()])
    toast('success', 'Ordem criada e enviada para a fila da Modelagem.')
  } catch (error: any) {
    const code = error.response?.data?.code
    errorOrdem.value = error.response?.data?.error || 'Não foi possível criar a ordem.'
    if (code === 'MODELO_TESTE_DUPLICADO') await Promise.all([carregarOrdensPendentes(), carregarModelosDisponiveis()])
  } finally {
    loadingOrdem.value = false
  }
}

async function carregarCatalogo() {
  if (catalogoCarregado.value || loadingCatalogo.value) return
  loadingCatalogo.value = true
  errorCatalogo.value = ''
  try {
    const { data } = await api.get<CatalogoItem[]>('/catalogo-pecas')
    catalogoPecas.value = data || []
    catalogoCarregado.value = true
  } catch {
    errorCatalogo.value = 'Não foi possível carregar o catálogo de peças.'
  } finally {
    loadingCatalogo.value = false
  }
}

async function carregarMaquinas() {
  if (maquinasCarregadas.value || loadingMaquinas.value) return
  loadingMaquinas.value = true
  errorMaquinas.value = ''
  try {
    const { data } = await api.get<any[]>('/config/opcoes/subsetor_corte').catch(() =>
      api.get<any[]>('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } }),
    )
    maquinasCorte.value = (data || []).map((item: any) => ({ id: item.id, label: item.label || item.valor, valor: item.valor }))
    maquinasCarregadas.value = true
    if (maquinasCorte.value.length === 0) errorMaquinas.value = 'Nenhum sub-setor de corte está ativo no cadastro.'
  } catch {
    errorMaquinas.value = 'Não foi possível carregar os sub-setores de corte.'
  } finally {
    loadingMaquinas.value = false
  }
}

async function carregarDetalhesModelo(modeloId: string) {
  const { data } = await api.get<Modelo>(`/admin/modelos/${modeloId}`)
  const catalogoPorId = new Map(catalogoPecas.value.map((item) => [item.id, item]))
  pecasSelecionadas.value = (data.pecas || []).map((peca: any) => {
    const itemCatalogo = peca.catalogoPeca || catalogoPorId.get(peca.catalogoPecaId)
    return {
      id: peca.id,
      catalogoPecaId: peca.catalogoPecaId,
      numero: itemCatalogo?.numero || peca.numero || '—',
      nome: peca.nome || itemCatalogo?.nome || 'Peça sem nome',
      codigoOriginal: itemCatalogo?.codigoOriginal || null,
      setorCorteOpcaoId: peca.setorCorteOpcaoId || '',
    }
  })
}

async function selecionarOrdemPendente(ordem: OrdemTeste) {
  selectedOrder.value = ordem
  completedOrder.value = null
  activeMode.value = 'modelagem'
  currentStep.value = 3
  caixaTeste.value = ordem.possuiCaixaTeste
  routeSalva.value = null
  errorPecas.value = ''
  errorRota.value = ''
  formModelo.value = {
    nome: ordem.modelo?.nome || 'Modelo',
    codigoProduto: ordem.modelo?.codigoProduto || '',
    marcaId: ordem.modelo?.marcaId || '',
    dataCorte: dateOnlyForInput(ordem.modelo?.dataCorte),
  }
  formOrdem.value = {
    plantaId: ordem.plantaId,
    prioridadePcp: ordem.prioridadePcp,
    observacoes: ordem.observacoes || '',
  }
  const loaded = await Promise.allSettled([carregarCatalogo(), carregarMaquinas()])
  if (loaded.some((item) => item.status === 'rejected')) toast('error', 'Não foi possível carregar toda a configuração de peças.')
  try {
    await carregarDetalhesModelo(ordem.modeloId)
  } catch (error: any) {
    errorPecas.value = error.response?.data?.error || 'Não foi possível carregar as peças atuais do modelo.'
  }
}

function addPeca(item: CatalogoItem) {
  pecasSelecionadas.value.push({
    catalogoPecaId: item.id,
    numero: item.numero,
    nome: item.nome,
    codigoOriginal: item.codigoOriginal,
    setorCorteOpcaoId: '',
  })
  searchPecaText.value = ''
  showAutocomplete.value = false
  autocompleteIndex.value = 0
}

function removerPeca(index: number) {
  const peca = pecasSelecionadas.value[index]
  if (peca?.id) {
    toast('error', 'Uma peça já persistida no modelo não pode ser removida por esta etapa para preservar os vínculos existentes.')
    return
  }
  pecasSelecionadas.value.splice(index, 1)
}

function navigateAutocomplete(direction: 1 | -1) {
  if (!filteredCatalogo.value.length) return
  showAutocomplete.value = true
  autocompleteIndex.value = (autocompleteIndex.value + direction + filteredCatalogo.value.length) % filteredCatalogo.value.length
}

function addHighlightedPiece() {
  const item = filteredCatalogo.value[autocompleteIndex.value]
  if (item) addPeca(item)
}

function handleClickOutside(event: MouseEvent) {
  if (autocompleteContainerRef.value && !autocompleteContainerRef.value.contains(event.target as Node)) {
    showAutocomplete.value = false
  }
}

async function salvarPecasEAvancar() {
  if (!selectedOrder.value || !podeConfigurarModelagem.value) return
  if (pecasSelecionadas.value.length < 2) {
    errorPecas.value = 'Cadastre ao menos uma peça para Lectra e uma para Ponte.'
    return
  }
  if (pecasSelecionadas.value.some((peca) => !peca.setorCorteOpcaoId)) {
    errorPecas.value = 'Selecione o sub-setor de corte de cada peça.'
    return
  }
  if (!maquinasUsadas.value.lectra || !maquinasUsadas.value.ponte) {
    errorPecas.value = 'Vincule ao menos uma peça a Lectra e uma peça a Ponte.'
    return
  }
  if (caixaTeste.value === null) {
    errorPecas.value = 'Informe se o modelo possui Caixa Teste.'
    return
  }

  loadingPecas.value = true
  errorPecas.value = ''
  try {
    const { data } = await api.put(`/ordens-teste/${selectedOrder.value.id}/modelagem/pecas`, {
      possuiCaixaTeste: caixaTeste.value,
      pecas: pecasSelecionadas.value.map((peca) => ({
        ...(peca.id ? { id: peca.id } : {}),
        catalogoPecaId: peca.catalogoPecaId,
        setorCorteOpcaoId: peca.setorCorteOpcaoId,
      })),
    })
    const idPorCatalogo = new Map<string, string>((data.pecas || []).map((peca: any): [string, string] => [peca.catalogoPecaId, peca.id]))
    pecasSelecionadas.value = pecasSelecionadas.value.map((peca) => ({ ...peca, id: peca.id || idPorCatalogo.get(peca.catalogoPecaId) }))
    selectedOrder.value.possuiCaixaTeste = caixaTeste.value
    currentStep.value = 4
    routeSalva.value = null
    errorRota.value = ''
  } catch (error: any) {
    errorPecas.value = error.response?.data?.error || 'Não foi possível salvar as peças do modelo.'
  } finally {
    loadingPecas.value = false
  }
}

async function finalizarModelagem(payload: RotaSalvaPayload) {
  if (!selectedOrder.value) return
  routeSalva.value = payload
  loadingRota.value = true
  errorRota.value = ''
  try {
    const { data } = await api.put(`/ordens-teste/${selectedOrder.value.id}/modelagem/finalizar`, {
      slasPorSetor: payload.slasPorSetor,
    })
    completedOrder.value = {
      ...data.ordem,
      modeloId: selectedOrder.value.modeloId,
      plantaId: selectedOrder.value.plantaId,
      modelo: selectedOrder.value.modelo || {
        id: selectedOrder.value.modeloId,
        nome: formModelo.value.nome,
        codigoProduto: formModelo.value.codigoProduto,
        marcaId: formModelo.value.marcaId,
        dataCorte: formModelo.value.dataCorte,
      },
    }
    selectedOrder.value = null
    await carregarOrdensPendentes()
    toast('success', 'Modelagem concluída. A rota foi vinculada e o teste está pronto para iniciar.')
  } catch (error: any) {
    errorRota.value = error.response?.data?.error || 'Não foi possível finalizar a configuração da rota.'
  } finally {
    loadingRota.value = false
  }
}

async function imprimirEtiqueta() {
  if (!completedOrder.value?.id || !podeCriarPcp.value || loadingPdf.value) return
  loadingPdf.value = true
  try {
    const response = await api.post('/etiquetas/gerar', {
      ordemTesteIds: [completedOrder.value.id],
      setorId: authStore.user.value?.setorId || 'ecb2d21d-51db-41a7-8261-17e8a5f03fed',
      tipoLote: 'LOTE_PRINCIPAL',
    }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
    window.open(url, '_blank')
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
  } catch {
    toast('error', 'Erro ao gerar a etiqueta da ordem.')
  } finally {
    loadingPdf.value = false
  }
}

function iniciarNovaOrdem() {
  completedOrder.value = null
  selectedOrder.value = null
  activeMode.value = 'pcp'
  currentStep.value = 1
  activeModelId.value = ''
  selectedExistingModelId.value = ''
  selectedInactiveBrandName.value = ''
  formModelo.value = { nome: '', codigoProduto: '', marcaId: '', dataCorte: '' }
  formOrdem.value = { plantaId: plantasPermitidas.value[0]?.id || '', prioridadePcp: 'MEDIA', observacoes: '' }
  errorModelo.value = ''
  errorOrdem.value = ''
}

function voltarParaFilaModelagem() {
  completedOrder.value = null
  selectedOrder.value = null
  activeMode.value = 'modelagem'
  currentStep.value = 0
  pecasSelecionadas.value = []
  caixaTeste.value = null
  carregarOrdensPendentes()
}

async function trocarModo(modo: 'pcp' | 'modelagem') {
  completedOrder.value = null
  selectedOrder.value = null
  activeMode.value = modo
  currentStep.value = modo === 'pcp' ? 1 : 0
  if (modo === 'modelagem') await carregarOrdensPendentes()
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await carregarDadosIniciais()
})

onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="wiz-root">
    <div class="wiz-toasts" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" :class="['wiz-toast', `wiz-toast--${item.type}`]">
        <CheckCircle v-if="item.type === 'success'" :size="16" aria-hidden="true" />
        <AlertCircle v-else :size="16" aria-hidden="true" />
        <span class="wiz-toast-text">{{ item.message }}</span>
      </div>
    </div>

    <div v-if="temAcessoAosDoisFluxos" class="flow-tabs" role="tablist" aria-label="Fluxo de trabalho">
      <button type="button" :class="{ active: activeMode === 'pcp' }" @click="trocarModo('pcp')">PCP · Nova ordem</button>
      <button type="button" :class="{ active: activeMode === 'modelagem' }" @click="trocarModo('modelagem')">
        Modelagem · Pendências <span>{{ ordensPendentes.length }}</span>
      </button>
    </div>

    <div v-if="loadingInit" class="wiz-loading-block" role="status">
      <Loader2 :size="30" class="wiz-spinner" aria-hidden="true" />
      <span>Carregando dados necessários...</span>
    </div>

    <template v-else>
      <div v-if="completedOrder" class="wiz-card wiz-success-card">
        <div class="wiz-done-icon-wrap" aria-hidden="true"><CheckCircle :size="34" /></div>
        <h1 class="wiz-done-title">
          {{ completedOrder.status === 'AGUARDANDO_MODELAGEM' ? 'Ordem criada — Aguardando Modelagem' : 'Modelagem concluída — Teste pronto para iniciar' }}
        </h1>
        <p class="wiz-done-desc">
          {{ completedOrder.status === 'AGUARDANDO_MODELAGEM'
            ? 'A unidade já pode acompanhar o teste. A produção será liberada após a Modelagem configurar peças, Caixa Teste e rota.'
            : 'Peças, Caixa Teste e a rota válida para a planta foram salvas e vinculadas a esta ordem.' }}
        </p>
        <div class="order-barcode-card">
          <Barcode :size="22" aria-hidden="true" />
          <span>{{ completedOrder.codigoBarras }}</span>
        </div>
        <div class="success-meta">
          <span><strong>Modelo:</strong> {{ completedOrder.modelo?.nome || formModelo.nome }}</span>
          <span><strong>Código:</strong> {{ completedOrder.modelo?.codigoProduto || formModelo.codigoProduto }}</span>
          <span class="pending-badge" :class="{ released: completedOrder.status !== 'AGUARDANDO_MODELAGEM' }">
            {{ completedOrder.status === 'AGUARDANDO_MODELAGEM' ? 'Aguardando Modelagem' : 'Pronto para iniciar teste de produção' }}
          </span>
        </div>
        <div class="wiz-footer-actions">
          <button v-if="completedOrder.status === 'AGUARDANDO_MODELAGEM' && podeConfigurarModelagem" type="button" class="btn-secondary" @click="selecionarOrdemPendente(completedOrder)">
            Configurar agora <ArrowRight :size="16" />
          </button>
          <button v-if="podeCriarPcp" type="button" class="btn-secondary" :disabled="loadingPdf" @click="imprimirEtiqueta">
            <Loader2 v-if="loadingPdf" :size="16" class="wiz-spinner" />
            <Printer v-else :size="16" /> Imprimir etiqueta
          </button>
          <button v-if="podeCriarPcp" type="button" class="btn-primary" @click="iniciarNovaOrdem">Criar outra ordem</button>
          <button v-else-if="podeConfigurarModelagem" type="button" class="btn-primary" @click="voltarParaFilaModelagem">Voltar à fila</button>
        </div>
      </div>

      <section v-else-if="activeMode === 'modelagem' && !selectedOrder" class="wiz-card queue-card">
        <div class="wiz-panel-header">
          <div>
            <p class="eyebrow">FILA DA MODELAGEM</p>
            <h1 class="wiz-panel-title">Ordens aguardando configuração</h1>
            <p class="wiz-panel-subtitle">Selecione uma ordem criada pelo PCP para cadastrar peças, definir Caixa Teste e construir a rota da planta.</p>
          </div>
          <button type="button" class="btn-secondary" @click="carregarOrdensPendentes">Atualizar fila</button>
        </div>
        <div v-if="ordensPendentes.length === 0" class="queue-empty">
          <CheckCircle :size="25" aria-hidden="true" />
          <span>Não há ordens aguardando Modelagem.</span>
        </div>
        <div v-else class="queue-list">
          <article v-for="ordem in ordensPendentes" :key="ordem.id" class="queue-item">
            <div>
              <span class="queue-code">{{ ordem.codigoBarras }}</span>
              <h2>{{ ordem.modelo?.nome || 'Modelo sem nome' }}</h2>
              <p>Código {{ ordem.modelo?.codigoProduto || '—' }} · {{ ordem.planta?.nome || 'Planta' }} · Prioridade {{ ordem.prioridadePcp }}</p>
            </div>
            <button type="button" class="btn-primary" @click="selecionarOrdemPendente(ordem)">Configurar <ArrowRight :size="15" /></button>
          </article>
        </div>
      </section>

      <template v-else-if="activeMode === 'pcp' && podeCriarPcp && currentStep > 0">
        <div class="wiz-stepper-header" aria-label="Etapas do PCP">
          <div v-for="(label, index) in ['Modelo', 'Ordem']" :key="label" class="wiz-step" :class="{ 'wiz-step--active': currentStep === index + 1, 'wiz-step--completed': currentStep > index + 1 }">
            <div class="wiz-step-bubble">
              <CheckCircle v-if="currentStep > index + 1" :size="16" aria-hidden="true" />
              <Layers v-else-if="index === 0" :size="16" aria-hidden="true" />
              <ClipboardCheck v-else :size="16" aria-hidden="true" />
            </div>
            <div class="wiz-step-info"><span class="wiz-step-number">Passo {{ index + 1 }}</span><span class="wiz-step-name">{{ label }}</span></div>
          </div>
        </div>

        <div class="wiz-card">
          <section v-if="currentStep === 1" class="wiz-step-panel">
            <div class="wiz-panel-header">
              <p class="eyebrow">PASSO 1 · PCP</p>
              <h1 class="wiz-panel-title">Cadastro do modelo</h1>
              <p class="wiz-panel-subtitle">Registre a identificação do modelo. A previsão de corte será informada no próximo passo, junto com a criação da ordem.</p>
            </div>
            <div v-if="errorModelo" class="wiz-error-banner" role="alert"><AlertCircle :size="16" /><span>{{ errorModelo }}</span></div>

            <details v-if="modelosDisponiveis.length && !activeModelId" class="existing-models">
              <summary>Continuar com um modelo cadastrado sem ordem</summary>
              <div class="existing-model-row">
                <select v-model="selectedExistingModelId" class="form-select" aria-label="Modelo sem ordem">
                  <option value="">Selecione um modelo</option>
                  <option v-for="modelo in modelosDisponiveis" :key="modelo.id" :value="modelo.id">{{ modelo.codigoProduto }} · {{ modelo.nome }}</option>
                </select>
                <button type="button" class="btn-secondary" :disabled="!selectedExistingModelId || loadingModelo" @click="selecionarModeloExistente">Carregar</button>
              </div>
            </details>

            <form class="wiz-form" @submit.prevent="submitModelo">
              <div class="form-grid">
                <div class="form-group">
                  <div class="brand-label-row">
                    <label for="marcaId" class="form-label">Marca <span class="required">*</span></label>
                    <button v-if="podeCriarPcp" type="button" class="brand-manage-button" @click="showBrandManager = true">Gerenciar marcas</button>
                  </div>
                  <select id="marcaId" v-model="formModelo.marcaId" class="form-select" required :disabled="!!activeModelId" @change="selectedInactiveBrandName = ''">
                    <option value="">Selecione a marca</option>
                    <option v-if="activeModelId && formModelo.marcaId && selectedInactiveBrandName" :value="formModelo.marcaId" disabled>{{ selectedInactiveBrandName }} (inativa)</option>
                    <option v-for="marca in marcas" :key="marca.id" :value="marca.id">{{ marca.nome }}</option>
                  </select>
                  <span v-if="!activeModelId && !formModelo.marcaId && selectedInactiveBrandName" class="field-hint">A marca {{ selectedInactiveBrandName }} foi desativada. Selecione uma marca ativa.</span>
                </div>
                <div class="form-group">
                  <label for="codigoProduto" class="form-label">Código do produto <span class="required">*</span></label>
                  <input id="codigoProduto" v-model="formModelo.codigoProduto" class="form-input" inputmode="numeric" maxlength="50" placeholder="Ex.: 001234" required :disabled="!!activeModelId" @input="sanitizeCodigoProduto" />
                </div>
                <div class="form-group col-span-2">
                  <label for="nomeModelo" class="form-label">Nome do modelo <span class="required">*</span></label>
                  <input id="nomeModelo" v-model="formModelo.nome" class="form-input" maxlength="150" placeholder="Ex.: AIR MAX TESTE" required :disabled="!!activeModelId" />
                </div>
              </div>
              <div class="wiz-footer-actions">
                <button type="button" class="btn-secondary" @click="router.push('/dashboard/ordens')">Cancelar</button>
                <button type="submit" class="btn-primary" :disabled="loadingModelo">
                  <Loader2 v-if="loadingModelo" :size="16" class="wiz-spinner" />
                  {{ activeModelId ? 'Avançar para a ordem' : 'Salvar modelo e avançar' }}
                  <ArrowRight v-if="!loadingModelo" :size="16" />
                </button>
              </div>
            </form>
          </section>

          <section v-else-if="currentStep === 2" class="wiz-step-panel">
            <div class="wiz-panel-header">
              <p class="eyebrow">PASSO 2 · PCP</p>
              <h1 class="wiz-panel-title">Criação da ordem de teste</h1>
              <p class="wiz-panel-subtitle">A ordem ficará visível para a unidade como “Aguardando Modelagem”. A rota não é necessária para cadastrar o teste futuro.</p>
            </div>
            <div v-if="errorOrdem" class="wiz-error-banner" role="alert"><AlertCircle :size="16" /><span>{{ errorOrdem }}</span></div>
            <div class="wiz-summary-section">
              <div><span class="wiz-sum-label">Modelo</span><strong>{{ formModelo.nome }} · {{ formModelo.codigoProduto }}</strong></div>
            </div>
            <form class="wiz-form" @submit.prevent="submitOrdem">
              <div class="form-grid">
                <div class="form-group col-span-2">
                  <label for="dataCorte" class="form-label"><Calendar :size="13" /> Previsão de corte <span class="required">*</span></label>
                  <input id="dataCorte" v-model="formModelo.dataCorte" class="form-input" type="date" required />
                  <span class="field-hint">Data prevista para o modelo estar pronto para corte.</span>
                </div>
                <div class="form-group col-span-2">
                  <label for="plantaId" class="form-label">Planta <span class="required">*</span></label>
                  <select id="plantaId" v-model="formOrdem.plantaId" class="form-select" required>
                    <option value="">Selecione a planta</option>
                    <option v-for="planta in plantasPermitidas" :key="planta.id" :value="planta.id">{{ planta.nome }} {{ planta.cidade ? `(${planta.cidade})` : '' }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="prioridadePcp" class="form-label">Prioridade PCP <span class="required">*</span></label>
                  <select id="prioridadePcp" v-model="formOrdem.prioridadePcp" class="form-select" required>
                    <option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
                  </select>
                </div>
                <div class="form-group col-span-2">
                  <label for="observacoes" class="form-label">Observações da ordem</label>
                  <textarea id="observacoes" v-model="formOrdem.observacoes" class="form-textarea" rows="3" placeholder="Informações para a unidade e para a Modelagem..."></textarea>
                </div>
              </div>
              <div class="wiz-footer-actions">
                <button type="button" class="btn-secondary" :disabled="loadingOrdem" @click="currentStep = 1"><ArrowLeft :size="16" /> Voltar ao modelo</button>
                <button type="submit" class="btn-primary" :disabled="loadingOrdem">
                  <Loader2 v-if="loadingOrdem" :size="16" class="wiz-spinner" /> Criar ordem e avisar a unidade <ArrowRight v-if="!loadingOrdem" :size="16" />
                </button>
              </div>
            </form>
          </section>
        </div>
      </template>

      <div v-else-if="activeMode === 'modelagem' && selectedOrder && !completedOrder" class="wiz-stepper-header" aria-label="Etapas da Modelagem">
        <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 3, 'wiz-step--completed': currentStep > 3 }">
          <div class="wiz-step-bubble"><Scissors :size="16" aria-hidden="true" /></div><div class="wiz-step-info"><span class="wiz-step-number">Passo 3</span><span class="wiz-step-name">Peças</span></div>
        </div>
        <div class="wiz-step-connector" :class="{ 'wiz-step-connector--active': currentStep > 3 }"></div>
        <div class="wiz-step" :class="{ 'wiz-step--active': currentStep === 4 }">
          <div class="wiz-step-bubble"><ListOrdered :size="16" aria-hidden="true" /></div><div class="wiz-step-info"><span class="wiz-step-number">Passo 4</span><span class="wiz-step-name">Rota</span></div>
        </div>
      </div>

      <div v-if="activeMode === 'modelagem' && selectedOrder && !completedOrder" class="wiz-card">
        <section v-if="currentStep === 3" class="wiz-step-panel">
          <div class="wiz-panel-header">
            <p class="eyebrow">PASSO 3 · MODELAGEM · {{ selectedOrder.codigoBarras }}</p>
            <h1 class="wiz-panel-title">Peças e Caixa Teste</h1>
            <p class="wiz-panel-subtitle">{{ formModelo.nome }} · Código {{ formModelo.codigoProduto }} · {{ selectedOrder.planta?.nome || 'Planta selecionada' }}. Defina o sub-setor de corte de cada peça.</p>
          </div>
          <div v-if="errorPecas || errorCatalogo || errorMaquinas" class="wiz-error-banner" role="alert"><AlertCircle :size="16" /><span>{{ errorPecas || errorCatalogo || errorMaquinas }}</span></div>

          <div class="form-group caixa-choice">
            <span class="form-label">Este modelo possui Caixa Teste? <span class="required">*</span></span>
            <div class="choice-row">
              <label><input v-model="caixaTeste" type="radio" :value="true" /> Sim</label>
              <label><input v-model="caixaTeste" type="radio" :value="false" /> Não</label>
            </div>
          </div>

          <div class="pecas-autocomplete-container" ref="autocompleteContainerRef">
            <label for="buscarPeca" class="form-label">Adicionar peça do catálogo</label>
            <div class="autocomplete-wrap">
              <Search :size="16" class="ac-icon" aria-hidden="true" />
              <input id="buscarPeca" v-model="searchPecaText" class="ac-input" type="search" autocomplete="off" placeholder="Buscar por número ou nome da peça..." aria-autocomplete="list" :aria-expanded="showAutocomplete" @focus="showAutocomplete = true" @input="showAutocomplete = true; autocompleteIndex = 0" @keydown.down.prevent="navigateAutocomplete(1)" @keydown.up.prevent="navigateAutocomplete(-1)" @keydown.enter.prevent="addHighlightedPiece" @keydown.esc="showAutocomplete = false" />
            </div>
            <div v-if="showAutocomplete" class="ac-dropdown" role="listbox">
              <div v-if="loadingCatalogo" class="ac-empty">Carregando catálogo...</div>
              <div v-else-if="errorCatalogo" class="ac-empty">{{ errorCatalogo }} <button type="button" class="link-button" @click="carregarCatalogo">Tentar novamente</button></div>
              <div v-else-if="filteredCatalogo.length === 0" class="ac-empty">Nenhuma peça encontrada.</div>
              <button v-for="(item, index) in filteredCatalogo" v-else :key="item.id" type="button" role="option" :aria-selected="index === autocompleteIndex" class="ac-item" :class="{ highlighted: index === autocompleteIndex }" @mousedown.prevent="addPeca(item)">
                <span class="ac-badge">{{ item.numero }}</span><span class="ac-name">{{ item.nome }}</span><span v-if="item.codigoOriginal" class="ac-ref">Ref.: {{ item.codigoOriginal }}</span>
              </button>
            </div>
          </div>

          <div class="pecas-selected-list">
            <div class="pecas-list-header"><span class="pecas-list-title">Peças atribuídas ao modelo ({{ pecasSelecionadas.length }})</span><span class="field-hint">Lectra e Ponte são obrigatórios</span></div>
            <div v-if="pecasSelecionadas.length === 0" class="pecas-empty"><Scissors :size="26" /><p>Busque no catálogo e adicione as peças do modelo.</p></div>
            <div v-else class="pecas-table-wrap">
              <table class="pecas-table">
                <thead><tr><th>Número</th><th>Peça</th><th>Sub-setor de corte</th><th>Ação</th></tr></thead>
                <tbody>
                  <tr v-for="(peca, index) in pecasSelecionadas" :key="peca.catalogoPecaId">
                    <td><span class="peca-num-badge">{{ peca.numero }}</span></td>
                    <td><strong>{{ peca.nome }}</strong></td>
                    <td><select v-model="peca.setorCorteOpcaoId" class="maquina-select" :disabled="loadingMaquinas"><option value="">Selecione...</option><option v-for="maquina in maquinasCorte" :key="maquina.id" :value="maquina.id">{{ maquina.label }}</option></select></td>
                    <td><button type="button" class="btn-remove-peca" :disabled="!!peca.id" :title="peca.id ? 'Esta peça já está vinculada ao modelo' : 'Remover peça'" @click="removerPeca(index)"><Trash2 :size="14" /></button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="wiz-footer-actions">
            <button type="button" class="btn-secondary" @click="voltarParaFilaModelagem"><ArrowLeft :size="16" /> Voltar à fila</button>
            <button type="button" class="btn-primary" :disabled="loadingPecas || loadingCatalogo || loadingMaquinas" @click="salvarPecasEAvancar">
              <Loader2 v-if="loadingPecas" :size="16" class="wiz-spinner" /> Salvar peças e avançar para rota <ArrowRight v-if="!loadingPecas" :size="16" />
            </button>
          </div>
        </section>

        <section v-show="currentStep === 4" class="wiz-step-panel route-panel">
          <div class="wiz-panel-header">
            <p class="eyebrow">PASSO 4 · MODELAGEM · {{ selectedOrder.codigoBarras }}</p>
            <h1 class="wiz-panel-title">Construtor de rota</h1>
            <p class="wiz-panel-subtitle">A rota será gravada como uma nova versão para {{ selectedOrder.planta?.nome || 'a planta da ordem' }} e vinculada a este teste ao finalizar.</p>
          </div>
          <div v-if="errorRota" class="wiz-error-banner" role="alert"><AlertCircle :size="16" /><span>{{ errorRota }}</span></div>
          <div class="route-builder-host">
            <RouteBuilder ref="routeBuilderRef" :key="routeBuilderKey" :modeloId="selectedOrder.modeloId" :isWizardMode="true" :plantaId="selectedOrder.plantaId" :autoEnableMaquinas="maquinasUsadas" @rota-salva="finalizarModelagem" />
          </div>
          <div class="wiz-footer-actions">
            <button type="button" class="btn-secondary" :disabled="loadingRota" @click="currentStep = 3"><ArrowLeft :size="16" /> Voltar às peças</button>
            <button type="button" class="btn-primary" :disabled="loadingRota" @click="routeBuilderRef?.salvarRota()">
              <Loader2 v-if="loadingRota" :size="16" class="wiz-spinner" /> Salvar rota e liberar produção <CheckCircle v-if="!loadingRota" :size="16" />
            </button>
          </div>
        </section>
      </div>
    </template>

    <BrandManagerModal v-if="showBrandManager && podeCriarPcp" @close="showBrandManager = false" @created="marcaCriada" @updated="marcaAtualizada" />
  </div>
</template>

<style scoped>
.wiz-root { display: flex; flex-direction: column; gap: 1rem; max-width: 76rem; margin: 0 auto; color: #0f172a; }
.wiz-card { position: relative; overflow: visible; background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: clamp(1.25rem, 3vw, 2rem); box-shadow: 0 8px 24px rgba(15, 23, 42, .05); }
.wiz-success-card { text-align: center; padding: 3rem 1.5rem; }
.wiz-done-icon-wrap { width: 4.25rem; height: 4.25rem; margin: 0 auto 1rem; border-radius: 1.25rem; display: grid; place-items: center; color: #1d4ed8; background: #eff6ff; }
.wiz-done-title { margin: 0; font-size: clamp(1.35rem, 3vw, 1.8rem); font-weight: 800; letter-spacing: -.04em; }
.wiz-done-desc { max-width: 42rem; margin: .75rem auto 1.4rem; color: #64748b; line-height: 1.6; }
.order-barcode-card { display: inline-flex; align-items: center; gap: .8rem; padding: .85rem 1.15rem; border: 1px solid #dbeafe; border-radius: .9rem; background: #f8fbff; color: #1e3a8a; font: 700 1.2rem ui-monospace, SFMono-Regular, monospace; }
.success-meta { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: .6rem 1.2rem; margin: 1.1rem 0 1.5rem; color: #475569; font-size: .85rem; }
.pending-badge { padding: .35rem .65rem; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: .72rem; font-weight: 800; }
.pending-badge.released { background: #ecfdf5; color: #047857; }
.flow-tabs { display: flex; gap: .35rem; align-self: flex-start; border: 1px solid #dbe3ef; border-radius: .8rem; padding: .25rem; background: #fff; }
.flow-tabs button { display: flex; align-items: center; gap: .5rem; border: 0; border-radius: .6rem; padding: .6rem .8rem; background: transparent; color: #64748b; font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
.flow-tabs button.active { color: #fff; background: #1e3a8a; }
.flow-tabs span { display: inline-grid; min-width: 1.2rem; height: 1.2rem; place-items: center; border-radius: 999px; background: rgba(255,255,255,.2); font-size: .68rem; }
.wiz-stepper-header { display: flex; align-items: center; gap: .3rem; padding: 1rem 1.4rem; border: 1px solid #e2e8f0; border-radius: .9rem; background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
.wiz-step { display: flex; align-items: center; gap: .65rem; flex: 1; opacity: .52; }
.wiz-step--active, .wiz-step--completed { opacity: 1; }
.wiz-step--completed { color: #1d4ed8; }
.wiz-step-bubble { width: 2.15rem; height: 2.15rem; flex: 0 0 auto; display: grid; place-items: center; border: 1px solid #cbd5e1; border-radius: .7rem; color: #64748b; background: #f8fafc; }
.wiz-step--active .wiz-step-bubble { color: #fff; border-color: #1e40af; background: #1e40af; box-shadow: 0 3px 10px rgba(30,64,175,.2); }
.wiz-step--completed .wiz-step-bubble { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
.wiz-step-info { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.wiz-step-number, .eyebrow { color: #64748b; font-size: .65rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
.wiz-step-name { font-size: .82rem; font-weight: 750; }
.wiz-step-connector { height: 1px; flex: .3; background: #e2e8f0; }
.wiz-step-connector--active { background: #93c5fd; }
.wiz-panel-header { margin-bottom: 1.3rem; }
.wiz-panel-title { margin: .2rem 0 .35rem; color: #0f172a; font-size: 1.3rem; font-weight: 800; letter-spacing: -.035em; }
.wiz-panel-subtitle { margin: 0; max-width: 58rem; color: #64748b; font-size: .88rem; line-height: 1.55; }
.eyebrow { margin: 0; color: #1d4ed8; }
.wiz-form { display: flex; flex-direction: column; gap: 1.25rem; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.form-group { display: flex; flex-direction: column; gap: .45rem; min-width: 0; }
.col-span-2 { grid-column: span 2; }
.form-label { display: flex; align-items: center; gap: .35rem; color: #334155; font-size: .75rem; font-weight: 750; }
.required { color: #dc2626; }
.form-input, .form-select, .form-textarea, .wiz-select { width: 100%; min-height: 2.7rem; border: 1px solid #cbd5e1; border-radius: .65rem; padding: .65rem .8rem; background: #fff; color: #0f172a; font: inherit; font-size: .84rem; outline: none; transition: border-color .15s, box-shadow .15s; }
.form-input:focus, .form-select:focus, .form-textarea:focus, .wiz-select:focus, .ac-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
.form-input:disabled, .form-select:disabled { background: #f8fafc; color: #64748b; }
.form-textarea { resize: vertical; }
.field-hint { color: #94a3b8; font-size: .7rem; line-height: 1.4; }
.brand-label-row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.brand-manage-button, .link-button { border: 0; padding: 0; background: transparent; color: #1d4ed8; font: inherit; font-size: .7rem; font-weight: 700; cursor: pointer; }
.wiz-footer-actions { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: .65rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
.btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 2.55rem; border-radius: .65rem; padding: .6rem .9rem; font: inherit; font-size: .78rem; font-weight: 750; cursor: pointer; transition: background .15s, border-color .15s, transform .15s; }
.btn-primary { border: 1px solid #1e3a8a; background: #1e3a8a; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
.btn-secondary { border: 1px solid #cbd5e1; background: #fff; color: #334155; }
.btn-secondary:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
.btn-primary:disabled, .btn-secondary:disabled { opacity: .55; cursor: not-allowed; }
.wiz-error-banner { display: flex; align-items: flex-start; gap: .55rem; margin: 0 0 1rem; padding: .75rem .9rem; border: 1px solid #fecaca; border-radius: .65rem; background: #fef2f2; color: #b91c1c; font-size: .8rem; }
.wiz-summary-section { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.3rem; padding: 1rem; border: 1px solid #dbeafe; border-radius: .75rem; background: #f8fbff; }
.wiz-summary-section > div { display: flex; flex-direction: column; gap: .2rem; }
.wiz-sum-label { color: #64748b; font-size: .67rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
.wiz-summary-section strong { color: #1e293b; font-size: .86rem; }
.existing-models { margin: 0 0 1.3rem; padding: .8rem .9rem; border: 1px solid #e2e8f0; border-radius: .7rem; background: #f8fafc; }
.existing-models summary { color: #334155; font-size: .78rem; font-weight: 750; cursor: pointer; }
.existing-model-row { display: flex; gap: .6rem; margin-top: .8rem; }
.queue-card { min-height: 17rem; }
.queue-empty { display: flex; align-items: center; justify-content: center; gap: .65rem; min-height: 10rem; border: 1px dashed #cbd5e1; border-radius: .8rem; color: #64748b; font-size: .85rem; }
.queue-list { display: flex; flex-direction: column; gap: .65rem; }
.queue-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: .8rem; background: #fbfdff; }
.queue-item h2 { margin: .25rem 0; font-size: 1rem; font-weight: 800; }
.queue-item p { margin: 0; color: #64748b; font-size: .75rem; }
.queue-code { color: #1d4ed8; font: 750 .72rem ui-monospace, SFMono-Regular, monospace; }
.caixa-choice { margin-bottom: 1.1rem; padding: .85rem 1rem; border: 1px solid #e2e8f0; border-radius: .75rem; background: #f8fafc; }
.choice-row { display: flex; gap: 1.2rem; }
.choice-row label { display: inline-flex; align-items: center; gap: .45rem; color: #334155; font-size: .82rem; font-weight: 700; cursor: pointer; }
.choice-row input { accent-color: #1d4ed8; }
.pecas-autocomplete-container { position: relative; z-index: 20; margin-bottom: 1.15rem; }
.autocomplete-wrap { position: relative; margin-top: .4rem; }
.ac-icon { position: absolute; left: .75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
.ac-input { width: 100%; height: 2.7rem; border: 1px solid #cbd5e1; border-radius: .65rem; padding: .65rem .8rem .65rem 2.3rem; color: #0f172a; font: inherit; font-size: .84rem; outline: none; }
.ac-dropdown { position: absolute; z-index: 100; top: calc(100% + .3rem); left: 0; right: 0; max-height: 19rem; overflow: auto; border: 1px solid #cbd5e1; border-radius: .7rem; background: #fff; box-shadow: 0 14px 34px rgba(15,23,42,.18); }
.ac-item { display: flex; align-items: center; gap: .7rem; width: 100%; min-height: 2.7rem; padding: .55rem .7rem; border: 0; border-bottom: 1px solid #f1f5f9; background: #fff; text-align: left; color: #1e293b; cursor: pointer; }
.ac-item:hover, .ac-item.highlighted { background: #eff6ff; }
.ac-empty { padding: .8rem; color: #64748b; font-size: .78rem; }
.ac-badge, .peca-num-badge { display: inline-grid; min-width: 2.25rem; place-items: center; border-radius: .35rem; padding: .18rem .35rem; background: #0f172a; color: #fff; font: 750 .68rem ui-monospace, SFMono-Regular, monospace; }
.ac-name { flex: 1; font-size: .8rem; font-weight: 650; }
.ac-ref { color: #94a3b8; font-size: .68rem; }
.pecas-selected-list { margin-top: 1rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: .8rem; background: #f8fafc; }
.pecas-list-header { display: flex; justify-content: space-between; align-items: center; gap: .6rem; margin-bottom: .7rem; }
.pecas-list-title { color: #334155; font-size: .72rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.pecas-empty { display: flex; align-items: center; justify-content: center; gap: .65rem; min-height: 6rem; border: 1px dashed #cbd5e1; border-radius: .6rem; color: #94a3b8; font-size: .8rem; text-align: center; }
.pecas-empty p { margin: .5rem; }
.pecas-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: .65rem; background: #fff; }
.pecas-table { width: 100%; border-collapse: collapse; min-width: 35rem; }
.pecas-table th { padding: .65rem; background: #f8fafc; color: #64748b; font-size: .65rem; text-align: left; text-transform: uppercase; letter-spacing: .05em; }
.pecas-table td { padding: .6rem; border-top: 1px solid #f1f5f9; font-size: .78rem; }
.maquina-select { width: 100%; min-height: 2.25rem; border: 1px solid #cbd5e1; border-radius: .5rem; padding: .4rem .55rem; background: #fff; color: #334155; font: inherit; font-size: .75rem; }
.btn-remove-peca { display: grid; place-items: center; width: 2rem; height: 2rem; margin: auto; border: 0; border-radius: .5rem; background: transparent; color: #64748b; cursor: pointer; }
.btn-remove-peca:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; }
.btn-remove-peca:disabled { opacity: .35; cursor: not-allowed; }
.route-builder-host { margin: 1rem 0; }
.wiz-loading-block { display: flex; align-items: center; justify-content: center; gap: .75rem; min-height: 16rem; color: #64748b; }
.wiz-spinner { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.wiz-toasts { position: fixed; top: 1rem; right: 1rem; z-index: 2000; display: flex; flex-direction: column; gap: .5rem; max-width: min(24rem, calc(100vw - 2rem)); }
.wiz-toast { display: flex; align-items: flex-start; gap: .5rem; padding: .75rem .9rem; border: 1px solid; border-radius: .7rem; background: #fff; box-shadow: 0 10px 30px rgba(15,23,42,.12); font-size: .78rem; }
.wiz-toast--success { border-color: #bbf7d0; color: #166534; }
.wiz-toast--error { border-color: #fecaca; color: #b91c1c; }
@media (max-width: 700px) {
  .wiz-stepper-header { align-items: flex-start; overflow-x: auto; padding: .8rem; }
  .wiz-step { min-width: 6.7rem; gap: .4rem; }
  .wiz-step-name { font-size: .72rem; }
  .wiz-step-connector { min-width: .6rem; margin-top: 1rem; }
  .form-grid { grid-template-columns: 1fr; }
  .col-span-2 { grid-column: auto; }
  .wiz-footer-actions { align-items: stretch; }
  .wiz-footer-actions button { flex: 1 1 auto; }
  .queue-item { align-items: flex-start; flex-direction: column; }
  .existing-model-row { flex-direction: column; }
  .success-meta { flex-direction: column; }
}
</style>
