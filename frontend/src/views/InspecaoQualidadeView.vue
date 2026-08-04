<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../api/axios'
import ModalAuthQuiosque from '../components/ModalAuthQuiosque.vue'
import {
  ShieldCheck,
  Search,
  Scan,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Camera,
  Upload,
  Trash2,
  Loader2,
  FileText,
  Building2,
  Box,
  X,
  AlertCircle,
  MapPin
} from '@lucide/vue'

// ─── Interfaces ───────────────────────────────────────────────────────────
interface Setor {
  id: string
  nome: string
  codigo?: string
  descricao?: string
}

interface ItemRastreamentoSetor {
  rastreamentoId: string
  setorId: string
  setorNome: string
  pecaId?: string
}

interface OpAgrupadaUI {
  codigoBarras: string
  ordemTesteId: string
  quantidadePares: number
  tipoLote: string
  modeloNome: string
  maquinasSetoresNomes: string[]
  setorContextoTexto: string
  items: ItemRastreamentoSetor[]
}

interface FotoEvidencia {
  file: File
  previewUrl: string
  name: string
  size: string
}

// ─── 1. Estado Reativo (Refs e Reactives - APENAS NO TOPO) ────────────────
const codigoLeitura = ref('')
const lotesDisponiveis = ref<any[]>([])
const lotesPendentesInspecao = ref<any[]>([])
const opAgrupadaAtiva = ref<OpAgrupadaUI | null>(null)
const setoresList = ref<Setor[]>([])

const loadingLotes = ref(false)
const loadingSetores = ref(false)
const loadingSubmissao = ref(false)

const resultadoDecisao = ref<'APROVADO' | 'APROVADO_COM_CONCESSAO' | 'REPROVADO' | null>(null)
const setorOrigemFalhaId = ref('')
const observacaoDivergencia = ref('')
const fotosEvidencias = ref<FotoEvidencia[]>([])

const showModalQuiosque = ref(false)
const inspetoraAutenticada = ref<any>(null)

// Camera State
const showCameraModal = ref(false)
const cameraError = ref('')
const isCameraActive = ref(false)
let html5QrcodeScanner: Html5Qrcode | null = null

// Toast State
const showToast = ref(false)
const toastMsg = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const inputScanRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDraggingOver = ref(false)

// ─── Computed Properties ──────────────────────────────────────────────────
const isReprovado = computed(() => resultadoDecisao.value === 'REPROVADO')

const podeSubmeter = computed(() => {
  if (!opAgrupadaAtiva.value || !resultadoDecisao.value) return false
  if (isReprovado.value) {
    return Boolean(setorOrigemFalhaId.value && observacaoDivergencia.value.trim().length >= 5)
  }
  return true
})

// Agrupa os rastreamentos pendentes de inspeção por OP (codigoBarras)
const opsPendentesAgrupadas = computed<OpAgrupadaUI[]>(() => {
  const map = new Map<string, OpAgrupadaUI>()

  for (const rast of lotesPendentesInspecao.value) {
    const codigo = (rast.ordemTeste?.codigoBarras || rast.ordemTesteId || 'OP').toUpperCase()
    const setorNome = rast.setor?.nome || 'Setor N/A'
    const setorId = rast.setorId || rast.setor?.id

    if (!map.has(codigo)) {
      map.set(codigo, {
        codigoBarras: codigo,
        ordemTesteId: rast.ordemTesteId || rast.ordemTeste?.id,
        quantidadePares: rast.ordemTeste?.quantidadePares || 0,
        tipoLote: rast.tipoLote || 'LOTE_PRINCIPAL',
        modeloNome: rast.ordemTeste?.modelo?.nome || 'Modelo N/A',
        maquinasSetoresNomes: [setorNome],
        setorContextoTexto: setorNome,
        items: [{
          rastreamentoId: rast.id,
          setorId,
          setorNome,
          pecaId: rast.pecaId || rast.peca?.id
        }]
      })
    } else {
      const grupo = map.get(codigo)!
      if (!grupo.maquinasSetoresNomes.includes(setorNome)) {
        grupo.maquinasSetoresNomes.push(setorNome)
      }
      if (!grupo.items.some(i => i.setorId === setorId)) {
        grupo.items.push({
          rastreamentoId: rast.id,
          setorId,
          setorNome,
          pecaId: rast.pecaId || rast.peca?.id
        })
      }
    }
  }

  for (const grupo of map.values()) {
    if (grupo.maquinasSetoresNomes.length > 1) {
      grupo.setorContextoTexto = `MÁQUINAS/SUBSETORES: ${grupo.maquinasSetoresNomes.join(', ')}`
    } else {
      grupo.setorContextoTexto = grupo.maquinasSetoresNomes[0] || 'Setor Operacional'
    }
  }

  return Array.from(map.values())
})

const modalQuiosqueSubtitulo = computed(() => {
  const setoresTexto = opAgrupadaAtiva.value?.maquinasSetoresNomes.join(', ') || 'Setores Operacionais'
  return `Aproxime seu crachá para validar a qualidade do(s) setor(es) ${setoresTexto}`
})

// ─── Auxiliary Helpers ────────────────────────────────────────────────────
function triggerToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMsg.value = msg
  toastType.value = type
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 4000)
}

function forcarFocoInput() {
  nextTick(() => {
    if (inputScanRef.value) {
      inputScanRef.value.focus()
    }
  })
}

function tocarSomSucesso() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch (e) {
    // Audio Context restrito pelo navegador
  }
}

// ─── Camera Barcode Scanner ───────────────────────────────────────────────
async function iniciarCamera() {
  showCameraModal.value = true
  cameraError.value = ''
  await nextTick()

  try {
    html5QrcodeScanner = new Html5Qrcode('camera-reader-inspecao')
    await html5QrcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        codigoLeitura.value = decodedText
        pararCamera()
        buscarEAtivarLote()
      },
      () => {}
    )
    isCameraActive.value = true
  } catch (err: any) {
    console.error('[InspecaoQualidadeView] Erro ao acessar câmera:', err)
    cameraError.value = 'Não foi possível acessar a câmera do dispositivo. Verifique as permissões do navegador.'
  }
}

async function pararCamera() {
  if (html5QrcodeScanner && isCameraActive.value) {
    try {
      await html5QrcodeScanner.stop()
      html5QrcodeScanner.clear()
    } catch (err) {
      console.warn('[InspecaoQualidadeView] Aviso ao parar câmera:', err)
    }
  }
  isCameraActive.value = false
  showCameraModal.value = false
  forcarFocoInput()
}

// ─── Business Logic ───────────────────────────────────────────────────────
async function carregarDadosIniciais() {
  loadingSetores.value = true
  loadingLotes.value = true
  try {
    const [resSetores, resLotes, resPendentes] = await Promise.all([
      api.get('/admin/setores'),
      api.get('/lotes'),
      api.get('/inspecoes/pendentes')
    ])
    setoresList.value = resSetores.data || []
    lotesDisponiveis.value = resLotes.data || []
    lotesPendentesInspecao.value = resPendentes.data || []
  } catch (err: any) {
    console.error('[InspecaoQualidadeView] Erro ao carregar dados iniciais:', err)
    triggerToast('Não foi possível carregar a fila de inspeção de qualidade.', 'error')
  } finally {
    loadingSetores.value = false
    loadingLotes.value = false
    forcarFocoInput()
  }
}

function selecionarOpAgrupada(grupo: OpAgrupadaUI) {
  opAgrupadaAtiva.value = grupo
  codigoLeitura.value = grupo.codigoBarras
  resetarFormularioDecisao()
  triggerToast(`OP ${grupo.codigoBarras} selecionada com ${grupo.items.length} etapa(s) para inspeção.`, 'info')
}

function buscarEAtivarLote() {
  const codigo = codigoLeitura.value.trim().toUpperCase()
  if (!codigo) {
    triggerToast('Digite ou bipe o código de barras da Ordem de Teste.', 'error')
    forcarFocoInput()
    return
  }

  // 1. Busca na fila de pendentes agrupadas por OP
  const grupoEncontrado = opsPendentesAgrupadas.value.find(
    g => g.codigoBarras === codigo || g.ordemTesteId.toUpperCase() === codigo
  )

  if (grupoEncontrado) {
    selecionarOpAgrupada(grupoEncontrado)
    return
  }

  // 2. Fallback: busca na lista geral de lotes
  const loteEncontrado = lotesDisponiveis.value.find(
    l => (l.codigoBarras || '').toUpperCase() === codigo || (l.id || '').toUpperCase() === codigo
  )

  if (loteEncontrado) {
    const setorNome = loteEncontrado.setorAtual?.nome || 'Setor Operacional'
    const setorId = loteEncontrado.setorAtual?.id || ''
    opAgrupadaAtiva.value = {
      codigoBarras: loteEncontrado.codigoBarras,
      ordemTesteId: loteEncontrado.id,
      quantidadePares: loteEncontrado.quantidadePares || 0,
      tipoLote: loteEncontrado.tipoLote || 'LOTE_PRINCIPAL',
      modeloNome: loteEncontrado.modelo?.nome || 'Modelo N/A',
      maquinasSetoresNomes: [setorNome],
      setorContextoTexto: setorNome,
      items: [{
        rastreamentoId: loteEncontrado.id,
        setorId,
        setorNome
      }]
    }
    resetarFormularioDecisao()
    triggerToast(`OP ${loteEncontrado.codigoBarras} selecionada para inspeção.`, 'info')
  } else {
    triggerToast(`Ordem de Teste com código "${codigo}" não foi localizada na fila.`, 'error')
    opAgrupadaAtiva.value = null
    forcarFocoInput()
  }
}

function resetarOrdemAtiva() {
  opAgrupadaAtiva.value = null
  codigoLeitura.value = ''
  resetarFormularioDecisao()
  forcarFocoInput()
}

function resetarFormularioDecisao() {
  resultadoDecisao.value = null
  setorOrigemFalhaId.value = ''
  observacaoDivergencia.value = ''
  limparFotosEvidencias()
}

// ─── Foto Uploader Handlers ───────────────────────────────────────────────
function aoSelecionarFotos(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    processarArquivosFotos(Array.from(target.files))
  }
}

function aoSoltarArquivos(event: DragEvent) {
  isDraggingOver.value = false
  if (event.dataTransfer && event.dataTransfer.files.length > 0) {
    processarArquivosFotos(Array.from(event.dataTransfer.files))
  }
}

function processarArquivosFotos(files: File[]) {
  const imagens = files.filter(f => f.type.startsWith('image/'))
  if (imagens.length === 0) {
    triggerToast('Selecione apenas arquivos de imagem válidos (PNG, JPG, WebP).', 'error')
    return
  }

  for (const file of imagens) {
    if (file.size > 10 * 1024 * 1024) {
      triggerToast(`A foto "${file.name}" excede o tamanho máximo de 10MB.`, 'error')
      continue
    }

    const previewUrl = URL.createObjectURL(file)
    const sizeKb = (file.size / 1024).toFixed(1) + ' KB'
    fotosEvidencias.value.push({
      file,
      previewUrl,
      name: file.name,
      size: sizeKb
    })
  }
}

function removerFoto(index: number) {
  const foto = fotosEvidencias.value[index]
  if (foto) {
    URL.revokeObjectURL(foto.previewUrl)
    fotosEvidencias.value.splice(index, 1)
  }
}

function limparFotosEvidencias() {
  for (const foto of fotosEvidencias.value) {
    URL.revokeObjectURL(foto.previewUrl)
  }
  fotosEvidencias.value = []
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// ─── Autenticação e Submissão em Lote (Promise.all) ───────────────────────
function solicitarAutenticacaoESalvar() {
  if (!opAgrupadaAtiva.value) {
    triggerToast('Selecione uma Ordem de Teste para realizar a avaliação.', 'error')
    return
  }

  if (!resultadoDecisao.value) {
    triggerToast('Selecione a decisão de qualidade (Aprovado, Concessão ou Reprovado).', 'error')
    return
  }

  if (isReprovado.value) {
    if (!setorOrigemFalhaId.value) {
      triggerToast('Selecione o Setor de Origem da Falha para o Retrabalho Cirúrgico.', 'error')
      return
    }
    if (!observacaoDivergencia.value.trim()) {
      triggerToast('Descreva a divergência / defeito identificado no lote.', 'error')
      return
    }
  }

  showModalQuiosque.value = true
}

async function onInspetoraAutenticadaSucesso(inspetora: any) {
  showModalQuiosque.value = false
  inspetoraAutenticada.value = inspetora
  await executarSubmissaoInspecao(inspetora)
}

async function executarSubmissaoInspecao(inspetora: any) {
  if (!opAgrupadaAtiva.value || !resultadoDecisao.value) return

  loadingSubmissao.value = true
  try {
    const resultadoEnum = resultadoDecisao.value === 'APROVADO_COM_CONCESSAO'
      ? 'APROVADO_CONCESSAO'
      : resultadoDecisao.value

    const itemsParaInspecionar = opAgrupadaAtiva.value.items

    // Dispara POST /api/inspecoes simultaneamente via Promise.all para todos os subsetores da OP ("em uma pancada só")
    const promisesInspecao = itemsParaInspecionar.map(item => {
      const payloadInspecao: any = {
        ordemTesteId: opAgrupadaAtiva.value!.ordemTesteId,
        setorId: item.setorId,
        tipoInspecao: 'SAIDA_SETOR',
        tipoLote: opAgrupadaAtiva.value!.tipoLote || 'LOTE_PRINCIPAL',
        resultado: resultadoEnum,
        observacoes: observacaoDivergencia.value.trim() || undefined,
        pecaId: item.pecaId || undefined
      }

      if (resultadoDecisao.value === 'REPROVADO') {
        payloadInspecao.setorDestinoId = setorOrigemFalhaId.value
        payloadInspecao.descricaoDefeito = observacaoDivergencia.value.trim()
      }

      return api.post('/inspecoes', payloadInspecao)
    })

    const resArray = await Promise.all(promisesInspecao)

    // Upload de Evidências Fotográficas (anexadas à primeira inspeção criada)
    const primeiraInspecaoId = resArray[0]?.data?.inspecao?.id || resArray[0]?.data?.id
    if (primeiraInspecaoId && fotosEvidencias.value.length > 0) {
      for (const fotoItem of fotosEvidencias.value) {
        const formData = new FormData()
        formData.append('file', fotoItem.file)
        try {
          await api.post(`/inspecoes/${primeiraInspecaoId}/anexos`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } catch (anexoErr) {
          console.warn(`[InspecaoQualidade] Aviso ao anexar foto ${fotoItem.name}:`, anexoErr)
        }
      }
    }

    const acaoTexto = resultadoDecisao.value === 'APROVADO'
      ? 'Aprovada'
      : (resultadoDecisao.value === 'APROVADO_COM_CONCESSAO' ? 'Aprovada com Concessão' : 'Reprovada (Retrabalho)')

    triggerToast(
      `Inspeção (${acaoTexto}) concluída para ${itemsParaInspecionar.length} etapa(s) da OP ${opAgrupadaAtiva.value.codigoBarras} em 1 pancada só!`,
      'success'
    )
    tocarSomSucesso()

    // Recarrega fila de pendentes e limpa tela
    await carregarDadosIniciais()
    resetarOrdemAtiva()
  } catch (err: any) {
    console.error('[InspecaoQualidadeView] Erro ao submeter inspeções em lote:', err?.response?.data || err)
    const errorData = err?.response?.data
    const descError = errorData?.error || errorData?.message || 'Falha ao registrar avaliação de qualidade em lote.'
    triggerToast(`Falha operacional: ${descError}`, 'error')
  } finally {
    loadingSubmissao.value = false
    inspetoraAutenticada.value = null
  }
}

onMounted(() => {
  carregarDadosIniciais()
})
</script>

<template>
  <div class="iq-root">
    <!-- ══ TOAST NOTIFICATION ═══════════════════════════════════════════ -->
    <Transition name="toast-slide">
      <div v-if="showToast" class="iq-toast" :class="`iq-toast--${toastType}`" role="alert">
        <AlertTriangle v-if="toastType === 'error'" :size="20" class="flex-shrink-0" />
        <AlertCircle v-else-if="toastType === 'info'" :size="20" class="flex-shrink-0 text-amber-500" />
        <CheckCircle2 v-else :size="20" class="flex-shrink-0" />
        <span class="text-xs font-semibold leading-snug">{{ toastMsg }}</span>
      </div>
    </Transition>

    <div class="w-full max-w-6xl space-y-6">
      <!-- ══ HEADER DA CENTRAL DE QUALIDADE ════════════════════════════════ -->
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-xl text-white">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 shadow-inner">
            <ShieldCheck :size="28" />
          </div>
          <div>
            <div class="flex items-center gap-2.5">
              <h1 class="text-xl font-bold tracking-tight text-white">Central de Inspeção de Qualidade</h1>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Posto Ativo
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">Avaliação técnica de lote, liberação de produção e retrabalho cirúrgico</p>
          </div>
        </div>

        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200 transition shadow-xs cursor-pointer"
          @click="forcarFocoInput"
        >
          <Scan :size="16" class="text-indigo-400" />
          <span>Focar Leitor (Scanner)</span>
        </button>
      </header>

      <!-- ══ PAINEL DE BIPAGEM / SELEÇÃO DA OP ══════════════════════════════ -->
      <section class="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <label for="op-scanner-input" class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Search :size="16" class="text-indigo-600" />
            <span>Identificação do Lote / Ordem de Teste</span>
          </label>
          <span class="text-[11px] font-medium text-slate-500">Bipe o código de barras, pesquise a OP ou use a Câmera</span>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch gap-3">
          <div class="relative flex-1 flex items-center">
            <input
              id="op-scanner-input"
              ref="inputScanRef"
              v-model="codigoLeitura"
              type="text"
              class="w-full h-12 bg-slate-50 border border-slate-300 rounded-xl pl-4 pr-10 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              placeholder="Bipe ou digite a OP (ex: OP-2026-001)..."
              @keydown.enter.prevent="buscarEAtivarLote"
            />
            <button
              v-if="codigoLeitura"
              type="button"
              class="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
              @click="resetarOrdemAtiva"
            >
              <X :size="16" />
            </button>
          </div>

          <button
            type="button"
            class="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-semibold text-white text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            @click="buscarEAtivarLote"
          >
            <Search :size="16" />
            <span>Buscar OP</span>
          </button>

          <button
            type="button"
            class="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
            @click="iniciarCamera"
          >
            <Camera :size="16" class="text-indigo-600" />
            <span>Câmera</span>
          </button>
        </div>
               <!-- FILA DE LOTES PENDENTES AGRUPADOS POR OP (AGRUPAMENTO VISUAL DE MÁQUINAS) -->
        <div v-if="!opAgrupadaAtiva && opsPendentesAgrupadas.length > 0" class="pt-2">
          <div class="flex items-center justify-between mb-2.5">
            <p class="text-[11px] font-semibold text-slate-500">
              Fila de Inspeção de Qualidade ({{ opsPendentesAgrupadas.length }} OP(s) aguardando liberação):
            </p>
            <span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 uppercase tracking-wider">
              Gate Agrupado por OP
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
            <button
              v-for="grupo in opsPendentesAgrupadas"
              :key="grupo.codigoBarras"
              type="button"
              class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/60 hover:border-indigo-300 text-left transition flex items-center justify-between group cursor-pointer"
              @click="selecionarOpAgrupada(grupo)"
            >
              <div>
                <span class="text-xs font-bold text-slate-800 group-hover:text-indigo-900 block font-mono">
                  {{ grupo.codigoBarras }}
                </span>
                <span class="text-[11px] text-slate-500 font-medium block">
                  {{ grupo.modeloNome }}
                </span>
                <span class="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 mt-1">
                  <MapPin :size="11" class="text-indigo-500 flex-shrink-0" />
                  <span>{{ grupo.maquinasSetoresNomes.join(', ') }}</span>
                </span>
              </div>
              <div class="text-right">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 border border-indigo-200 text-indigo-800 block mb-1">
                  {{ grupo.items.length }} etapa(s)
                </span>
                <span class="text-[10px] text-slate-500 font-medium">
                  {{ grupo.quantidadePares }} pares
                </span>
              </div>
            </button>
          </div>
        </div>

        <div v-else-if="!opAgrupadaAtiva && opsPendentesAgrupadas.length === 0" class="pt-2 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <p class="text-xs font-medium text-slate-500">Nenhuma Ordem de Teste pendente de inspeção na fila no momento.</p>
        </div>
      </section>

      <!-- ══ DETALHES DA OP SELECIONADA & CONTEXTO DE MÁQUINAS AGRUPADAS ═════ -->
      <section v-if="opAgrupadaAtiva" class="p-6 rounded-2xl bg-white border border-indigo-100 shadow-sm relative overflow-hidden space-y-6">
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-800"></div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div class="flex items-center gap-3.5">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
              <Box :size="20" />
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Ordem de Teste Ativa</span>
              <h2 class="text-lg font-bold text-slate-900 tracking-tight font-mono">{{ opAgrupadaAtiva.codigoBarras }}</h2>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {{ opAgrupadaAtiva.quantidadePares }} Pares
            </span>
            <span class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {{ opAgrupadaAtiva.items.length }} etapa(s)
            </span>
            <button
              type="button"
              class="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition ml-2"
              title="Trocar de OP"
              @click="resetarOrdemAtiva"
            >
              <X :size="18" />
            </button>
          </div>
        </div>

        <!-- ══ CONTEXTO DESTACADO DAS MÁQUINAS/SUBSETORES EM AVALIAÇÃO ═══════ -->
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0">
              <MapPin :size="20" />
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Etapa(s) em Avaliação de Qualidade</span>
              <span class="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                <span>Avaliando:</span>
                <span class="text-indigo-400 uppercase font-extrabold">{{ opAgrupadaAtiva.maquinasSetoresNomes.join(', ') }}</span>
              </span>
            </div>
          </div>
          <span class="self-start sm:self-auto px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] font-bold">
            {{ opAgrupadaAtiva.items.length }} Etapa(s) — Pancada Única
          </span>
        </div>

        <!-- ══ FORMULÁRIO DE DECISÃO DE QUALIDADE ════════════════════════════ -->
        <div class="space-y-6">
          <div>
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">1. Resultado da Inspeção Técnica *</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <!-- APROVADO -->
              <button
                type="button"
                class="p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-2.5 text-left cursor-pointer relative overflow-hidden"
                :class="[
                  resultadoDecisao === 'APROVADO'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/20'
                    : 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-400 text-emerald-950 hover:bg-emerald-50'
                ]"
                @click="resultadoDecisao = 'APROVADO'"
              >
                <div class="flex items-center justify-between w-full">
                  <div
                    class="w-8 h-8 rounded-lg flex items-center justify-center"
                    :class="resultadoDecisao === 'APROVADO' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'"
                  >
                    <CheckCircle2 :size="20" />
                  </div>
                  <span
                    v-if="resultadoDecisao === 'APROVADO'"
                    class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold text-xs"
                  >✓</span>
                </div>
                <div>
                  <span class="text-sm font-bold block">APROVADO</span>
                  <span class="text-xs opacity-90 leading-tight block mt-0.5" :class="resultadoDecisao === 'APROVADO' ? 'text-emerald-100' : 'text-emerald-800'">
                    Conforme padrões técnicos. Liberado para avanço em lote.
                  </span>
                </div>
              </button>

              <!-- APROVADO COM CONCESSÃO -->
              <button
                type="button"
                class="p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-2.5 text-left cursor-pointer relative overflow-hidden"
                :class="[
                  resultadoDecisao === 'APROVADO_COM_CONCESSAO'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/20'
                    : 'bg-amber-50/50 border-amber-200 hover:border-amber-400 text-amber-950 hover:bg-amber-50'
                ]"
                @click="resultadoDecisao = 'APROVADO_COM_CONCESSAO'"
              >
                <div class="flex items-center justify-between w-full">
                  <div
                    class="w-8 h-8 rounded-lg flex items-center justify-center"
                    :class="resultadoDecisao === 'APROVADO_COM_CONCESSAO' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'"
                  >
                    <AlertTriangle :size="20" />
                  </div>
                  <span
                    v-if="resultadoDecisao === 'APROVADO_COM_CONCESSAO'"
                    class="w-5 h-5 rounded-full bg-white text-amber-600 flex items-center justify-center font-bold text-xs"
                  >✓</span>
                </div>
                <div>
                  <span class="text-sm font-bold block">APROVADO C/ CONCESSÃO</span>
                  <span class="text-xs opacity-90 leading-tight block mt-0.5" :class="resultadoDecisao === 'APROVADO_COM_CONCESSAO' ? 'text-amber-100' : 'text-amber-800'">
                    Divergência mínima aceitável sob ressalva.
                  </span>
                </div>
              </button>

              <!-- REPROVADO (RETRABALHO) -->
              <button
                type="button"
                class="p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-2.5 text-left cursor-pointer relative overflow-hidden"
                :class="[
                  resultadoDecisao === 'REPROVADO'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/20'
                    : 'bg-rose-50/50 border-rose-200 hover:border-rose-400 text-rose-950 hover:bg-rose-50'
                ]"
                @click="resultadoDecisao = 'REPROVADO'"
              >
                <div class="flex items-center justify-between w-full">
                  <div
                    class="w-8 h-8 rounded-lg flex items-center justify-center"
                    :class="resultadoDecisao === 'REPROVADO' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'"
                  >
                    <XCircle :size="20" />
                  </div>
                  <span
                    v-if="resultadoDecisao === 'REPROVADO'"
                    class="w-5 h-5 rounded-full bg-white text-rose-600 flex items-center justify-center font-bold text-xs"
                  >✓</span>
                </div>
                <div>
                  <span class="text-sm font-bold block">REPROVADO (RETRABALHO)</span>
                  <span class="text-xs opacity-90 leading-tight block mt-0.5" :class="resultadoDecisao === 'REPROVADO' ? 'text-rose-100' : 'text-rose-800'">
                    Não conformidade. Retrabalho cirúrgico exigido.
                  </span>
                </div>
              </button>
            </div>
          </div>

          <!-- ══ SUB-FORMULÁRIO DE RETRABALHO CIRÚRGICO (REPROVADO) ════════════ -->
          <Transition name="fade-expand">
            <div v-if="isReprovado" class="p-5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-4">
              <div class="flex items-center gap-2.5 text-rose-900 pb-2 border-b border-rose-200/60">
                <RotateCcw :size="18" class="text-rose-600" />
                <h4 class="text-xs font-bold uppercase tracking-wider">Detalhamento do Retrabalho Cirúrgico</h4>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- SETOR DE ORIGEM DA FALHA (DESTINO DO RETRABALHO) -->
                <div class="space-y-1.5">
                  <label for="setor-falha-select" class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 :size="14" class="text-rose-600" />
                    <span>Setor de Origem da Falha (Destino do Retrabalho) *</span>
                  </label>
                  <select
                    id="setor-falha-select"
                    v-model="setorOrigemFalhaId"
                    class="w-full h-11 bg-white border border-rose-300 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition"
                    required
                  >
                    <option value="" disabled>Selecione o setor onde ocorreu o defeito...</option>
                    <option v-for="setor in setoresList" :key="setor.id" :value="setor.id">
                      {{ setor.nome }}
                    </option>
                  </select>
                </div>

                <!-- DESCRIÇÃO DA DIVERGÊNCIA -->
                <div class="space-y-1.5 md:col-span-2">
                  <label for="observacao-divergencia" class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText :size="14" class="text-rose-600" />
                    <span>Descrição Detalhada do Defeito / Divergência *</span>
                  </label>
                  <textarea
                    id="observacao-divergencia"
                    v-model="observacaoDivergencia"
                    rows="3"
                    class="w-full bg-white border border-rose-300 rounded-xl p-3 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition resize-none"
                    placeholder="Descreva minuciosamente o motivo da reprovação, a peça/componente afetado e a correção necessária..."
                    required
                  ></textarea>
                </div>
              </div>

              <!-- UPLOADER DE FOTOS DE EVIDÊNCIAS -->
              <div class="space-y-2 pt-1">
                <label class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Camera :size="14" class="text-rose-600" />
                  <span>Evidências Fotográficas dos Defeitos (Opcional)</span>
                </label>

                <!-- DROPZONE VISUAL -->
                <div
                  class="p-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
                  :class="[
                    isDraggingOver
                      ? 'border-rose-500 bg-rose-100/50'
                      : 'border-rose-300 bg-white hover:bg-rose-50/50'
                  ]"
                  @dragover.prevent="isDraggingOver = true"
                  @dragleave.prevent="isDraggingOver = false"
                  @drop.prevent="aoSoltarArquivos"
                  @click="fileInputRef?.click()"
                >
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept="image/*"
                    multiple
                    class="hidden"
                    @change="aoSelecionarFotos"
                  />
                  <div class="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                    <Upload :size="20" />
                  </div>
                  <div>
                    <span class="text-xs font-bold text-slate-800 block">Clique para enviar ou arraste fotos dos defeitos</span>
                    <span class="text-[10px] text-slate-500 block">Formatos suportados: PNG, JPG, WebP (Máx. 10MB)</span>
                  </div>
                </div>

                <!-- PREVIEW DE FOTOS SELECCIONADAS -->
                <div v-if="fotosEvidencias.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div
                    v-for="(foto, idx) in fotosEvidencias"
                    :key="idx"
                    class="relative group rounded-xl overflow-hidden border border-rose-200 bg-white shadow-xs aspect-square flex flex-col"
                  >
                    <img :src="foto.previewUrl" :alt="foto.name" class="w-full h-full object-cover" />
                    <button
                      type="button"
                      class="absolute top-1.5 right-1.5 p-1 rounded-lg bg-rose-600 text-white opacity-90 hover:opacity-100 transition shadow-sm"
                      title="Remover foto"
                      @click.stop="removerFoto(idx)"
                    >
                      <Trash2 :size="14" />
                    </button>
                    <div class="absolute bottom-0 left-0 right-0 p-1.5 bg-slate-900/80 backdrop-blur-xs text-[9px] font-semibold text-white truncate">
                      {{ foto.name }} ({{ foto.size }})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <!-- CAMPO DE OBSERVAÇÃO PARA APROVADO OU CONCESSÃO -->
          <div v-if="resultadoDecisao && !isReprovado" class="space-y-1.5">
            <label for="obs-geral-inspecao" class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText :size="14" class="text-slate-500" />
              <span>Observações Gerais da Inspeção (Opcional)</span>
            </label>
            <textarea
              id="obs-geral-inspecao"
              v-model="observacaoDivergencia"
              rows="2"
              class="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition resize-none"
              placeholder="Digite observações relevantes ou condições de concessão técnica..."
            ></textarea>
          </div>

          <!-- ══ SUBMISSÃO E AUTENTICAÇÃO ═══════════════════════════════════ -->
          <div class="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition cursor-pointer"
              @click="resetarFormularioDecisao"
            >
              Limpar Formulário
            </button>

            <button
              type="button"
              class="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              :class="[
                podeSubmeter && !loadingSubmissao
                  ? (isReprovado ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800' : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800')
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              ]"
              :disabled="!podeSubmeter || loadingSubmissao"
              @click="solicitarAutenticacaoESalvar"
            >
              <Loader2 v-if="loadingSubmissao" :size="18" class="animate-spin" />
              <ShieldCheck v-else :size="18" />
              <span>{{ loadingSubmissao ? 'Registrando...' : 'Salvar Avaliação em Lote' }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- ── MODAL CÂMERA SCANNER (TABLET / MOBILE) ── -->
    <Transition name="fade-expand">
      <div v-if="showCameraModal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full text-white shadow-2xl relative">
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2.5">
              <Camera :size="20" class="text-indigo-400" />
              <h3 class="text-sm font-bold">Scanner de Código de Barras</h3>
            </div>
            <button
              type="button"
              class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              @click="pararCamera"
            >
              <X :size="20" />
            </button>
          </div>

          <div v-if="cameraError" class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold text-center mb-4">
            {{ cameraError }}
          </div>

          <div class="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-square flex items-center justify-center">
            <div id="camera-reader-inspecao" class="w-full h-full"></div>
          </div>

          <p class="text-[11px] text-slate-400 text-center mt-4">
            Aproxime o código de barras da OP da câmera do dispositivo para leitura automática.
          </p>

          <div class="mt-4 flex justify-end">
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
              @click="pararCamera"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── MODAL QUIOSQUE (AUTENTICAÇÃO DA INSPETORA DE QUALIDADE) ── -->
    <ModalAuthQuiosque
      :show="showModalQuiosque"
      titulo="Autenticação da Inspetora"
      :subtitulo="modalQuiosqueSubtitulo"
      @fechar="showModalQuiosque = false"
      @sucesso="onInspetoraAutenticadaSucesso"
    />
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════
   ROOT LAYOUT & CONTAINER
═══════════════════════════════════════════════════════ */
.iq-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: calc(100vh - 8rem);
  padding: 1.5rem 1rem;
}

/* ═══════════════════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════════════════ */
.iq-toast {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  items-center: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  border-radius: 0.875rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
  max-width: 26rem;
  backdrop-filter: blur(8px);
}

.iq-toast--success {
  background-color: rgba(6, 78, 59, 0.95);
  border: 1px solid #059669;
  color: #ecfdf5;
}

.iq-toast--error {
  background-color: rgba(136, 19, 55, 0.95);
  border: 1px solid #e11d48;
  color: #fff1f2;
}

.iq-toast--info {
  background-color: rgba(30, 41, 59, 0.95);
  border: 1px solid #475569;
  color: #f8fafc;
}

/* Transitions */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(-1rem) scale(0.95);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.95);
}

.fade-expand-enter-active,
.fade-expand-leave-active {
  transition: all 0.3s ease-in-out;
  max-height: 800px;
  opacity: 1;
}

.fade-expand-enter-from,
.fade-expand-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
