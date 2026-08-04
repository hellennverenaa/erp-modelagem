<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  X,
  Package,
  AlertCircle,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  BarChart3,
  Activity,
  MapPin,
  LogIn,
  LogOut,
  Timer,
  ChevronRight,
  Info,
  Printer,
  Settings,
  Calendar,
  Clock,
  Sliders,
  Scissors,
  Lock,
  ShieldCheck,
  History
} from '@lucide/vue'
import api from '../api/axios'
import { authStore } from '../api/auth.store'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface PecaInfo {
  id: string
  nome: string
  codigoBarras: string | null
  descricao: string | null
  setorCorteOpcaoId: string
}

interface MarcaInfo {
  id: string
  nome: string
}

interface Modelo {
  id: string
  nome: string
  codigoProduto: string
  pecas?: PecaInfo[]
  marca?: MarcaInfo
}

interface OrdemTeste {
  id: string
  codigoBarras: string
  modeloId: string
  plantaId: string
  prioridadePcp: string
  status: string
  liberadoProducao: boolean
  possuiCaixaTeste: boolean
  observacoes: string | null
  dataPrevistaProducao?: string | null
  slasPorSetor?: Record<string, number> | null
  createdAt: string
  updatedAt: string
  modelo?: Modelo
}

interface Planta {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface SetorInfo {
  id: string
  nome: string
  tipoSetor?: string | null
}

interface OperadorInfo {
  id: string
  nomeCompleto: string
  usuario: string
}

interface EstacaoInfo {
  id?: string
  nome?: string
  codigo?: string
}

interface RastreamentoHistorico {
  id: string
  ordemTesteId: string
  setorId: string
  tipoLote: string
  dataEntrada: string | null
  dataSaida: string | null
  tempoPermanenciaMin: number | null
  status: string
  setor: SetorInfo | null
  operadorEntrada: OperadorInfo | null
  operadorSaida: OperadorInfo | null
  estacao?: EstacaoInfo | null
}

interface HistoricoResponse {
  ordemTesteId: string
  total: number
  historico: RastreamentoHistorico[]
}

// ─── Estado Reativo ────────────────────────────────────────────
const router = useRouter()
const ordens = ref<OrdemTeste[]>([])
const modelos = ref<Modelo[]>([])
const catalogoModelos = ref<Modelo[]>([])
const plantas = ref<Planta[]>([])

const loading = ref(true)
const loadingCreate = ref(false)
const showModal = ref(false)
const searchQuery = ref('')
const toasts = ref<Toast[]>([])

// ─── Resolução de Nomes do Catálogo ───────────────────────────────────
function getModeloNome(modeloId: string) {
  const m = catalogoModelos.value.find(x => x.id === modeloId)
  return m ? m.nome : `Modelo #${modeloId.substring(0, 8)}`
}

function getModeloReferencia(modeloId: string) {
  const m = catalogoModelos.value.find(x => x.id === modeloId)
  return m ? m.codigoProduto : 'N/A'
}
let toastCounter = 0

// ─── Timeline / Drawer de Rastreamento ──────────────────────────────
const showTimeline = ref(false)
const timelineOrdem = ref<OrdemTeste | null>(null)
const timelineData = ref<RastreamentoHistorico[]>([])
const loadingTimeline = ref(false)
const loadingPdfId = ref<string | null>(null)
const user = computed(() => authStore.user.value)

async function imprimirOrdem(ordem: OrdemTeste, tipoLote: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL' = 'LOTE_PRINCIPAL') {
  if (loadingPdfId.value) return
  
  loadingPdfId.value = `${ordem.id}-${tipoLote}`
  try {
    const response = await api.post('/etiquetas/gerar', {
      ordemTesteIds: [ordem.id],
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
    loadingPdfId.value = null
  }
}

// ─── Gerador de Código de Barras SVG Code 128 (Zero Dependências) ────────────
function generateCode128Svg(text: string): string {
  const code128patterns: string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142411', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '611111', '123311', '123131', '116111'
  ]
  
  let checksum = 104
  let patternStr = code128patterns[104]
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32
    if (code >= 0 && code <= 95) {
      checksum += code * (i + 1)
      patternStr += code128patterns[code]
    }
  }
  checksum %= 103
  patternStr += code128patterns[checksum]
  patternStr += code128patterns[106]
  
  let x = 10
  let rects = ''
  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10) * 2
    if (i % 2 === 0) {
      rects += `<rect x="${x}" y="4" width="${width}" height="42" fill="#000000" />`
    }
    x += width
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 10}" height="62" viewBox="0 0 ${x + 10} 62" style="display: block; margin: 0 auto;"><rect width="100%" height="100%" fill="#ffffff"/>${rects}<text x="${(x + 10) / 2}" y="57" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle" fill="#000000">${text}</text></svg>`
}

// ─── Lógica de Impressão de Tickets Físicos de Corte (Agrupados por Máquina) ──
const loadingTicketsId = ref<string | null>(null)
const corteOpcoesMap = ref<Record<string, string>>({})

async function fetchCorteOpcoesMap() {
  if (Object.keys(corteOpcoesMap.value).length > 0) return
  try {
    let opcoes = []
    try {
      const res = await api.get('/config/opcoes/subsetor_corte')
      opcoes = res.data || []
    } catch {
      const resFallback = await api.get('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } })
      opcoes = resFallback.data || []
    }
    const map: Record<string, string> = {}
    for (const opt of opcoes) {
      map[opt.id] = opt.label || opt.valor
    }
    corteOpcoesMap.value = map
  } catch (err) {
    console.warn('[GestaoOrdensView] Não foi possível carregar opções de subsetor_corte:', err)
  }
}

async function imprimirTicketsCorte(ordem: OrdemTeste) {
  if (loadingTicketsId.value) return
  loadingTicketsId.value = ordem.id

  try {
    await fetchCorteOpcoesMap()

    const { data: ordemCompleta } = await api.get(`/lotes/${ordem.id}`)
    
    let pecas: PecaInfo[] = ordemCompleta.modelo?.pecas || ordem.modelo?.pecas || []
    
    if (pecas.length === 0 && (ordemCompleta.modeloId || ordem.modeloId)) {
      try {
        const targetModeloId = ordemCompleta.modeloId || ordem.modeloId
        const { data: pecasRes } = await api.get(`/pecas/modelo/${targetModeloId}`)
        pecas = pecasRes || []
      } catch (errPecas) {
        console.warn('[GestaoOrdensView] Falha ao carregar peças do modelo:', errPecas)
      }
    }

    if (pecas.length === 0) {
      addToast('error', 'Nenhuma peça cadastrada para este modelo.')
      return
    }

    // 1. Agrupa peças por setorCorteOpcaoId (Máquina de Corte)
    const agrupamento: Record<string, { machineName: string; pecas: PecaInfo[] }> = {}

    for (const peca of pecas) {
      const machineId = peca.setorCorteOpcaoId || 'OUTROS'
      let machineName = corteOpcoesMap.value[machineId] || 'Corte — Geral'
      
      if (machineName.toLowerCase().startsWith('corte ')) {
        machineName = machineName.replace(/^corte\s+/i, 'Corte — ')
      } else if (!machineName.toLowerCase().includes('corte')) {
        machineName = `Corte — ${machineName}`
      }

      if (!agrupamento[machineId]) {
        agrupamento[machineId] = { machineName, pecas: [] }
      }
      agrupamento[machineId].pecas.push(peca)
    }

    const modeloNome = ordemCompleta.modelo?.nome || getModeloNome(ordem.modeloId)
    const modeloRef = ordemCompleta.modelo?.codigoProduto || getModeloReferencia(ordem.modeloId)
    const plantaNome = ordemCompleta.planta?.nome || 'Planta Padrão'
    const codigoBarrasOP = ordemCompleta.codigoBarras || ordem.codigoBarras
    const dataHoje = new Date().toLocaleDateString('pt-BR')

    // 2. Fatiamento (Chunking) das peças por máquina para paginação física de etiquetas
    const MAX_PECAS_POR_TICKET = 6

    interface TicketCardData {
      machineBadgeText: string
      pecasChunk: PecaInfo[]
    }

    const ticketCardsData: TicketCardData[] = []

    for (const grupo of Object.values(agrupamento)) {
      const totalPecas = grupo.pecas.length
      
      if (totalPecas <= MAX_PECAS_POR_TICKET) {
        ticketCardsData.push({
          machineBadgeText: grupo.machineName,
          pecasChunk: grupo.pecas
        })
      } else {
        const totalPaginas = Math.ceil(totalPecas / MAX_PECAS_POR_TICKET)
        for (let page = 0; page < totalPaginas; page++) {
          const start = page * MAX_PECAS_POR_TICKET
          const end = start + MAX_PECAS_POR_TICKET
          const chunk = grupo.pecas.slice(start, end)

          ticketCardsData.push({
            machineBadgeText: `${grupo.machineName} (${page + 1}/${totalPaginas})`,
            pecasChunk: chunk
          })
        }
      }
    }

    // 3. Monta o HTML de cada Ticket Card a partir das etiquetas fatiadas
    const ticketCardsHtml = ticketCardsData.map((card) => {
      const barcodeSvg = generateCode128Svg(codigoBarrasOP)
      const pecasListText = card.pecasChunk.map(p => p.nome).join(' • ')

      return `
        <div class="ticket-card">
          <!-- LINHA DE CABEÇALHO DO CARD (NOME DO MODELO + BADGE DE MÁQUINA) -->
          <div class="ticket-header-row">
            <span class="model-title">${modeloNome}</span>
            <span class="machine-badge">${card.machineBadgeText}</span>
          </div>

          <!-- SUB-CABEÇALHO COM CAIXA DE BORDA -->
          <div class="sub-header-box">
            <span>TESTE DE PRODUÇÃO</span>
          </div>

          <!-- CÓDIGO DE BARRAS CENTRALIZADO -->
          <div class="barcode-container">
            ${barcodeSvg}
            <div class="barcode-text">${codigoBarrasOP}</div>
          </div>

          <!-- PEÇAS ATRIBUÍDAS EM LINHA COMPACTA -->
          <div class="pieces-inline-section">
            <span class="pieces-label">PEÇAS (${card.pecasChunk.length}):</span>
            <span class="pieces-list">${pecasListText}</span>
          </div>

          <!-- RODAPÉ COMPACTO EM 3 COLUNAS -->
          <div class="ticket-footer-row">
            <span class="footer-left">${plantaNome}</span>
            <span class="footer-center">REF: ${modeloRef} ${modeloNome}</span>
            <span class="footer-right">${dataHoje}</span>
          </div>
        </div>
      `
    }).join('')

    const fullPrintHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>TICKETS CORTE — ${codigoBarrasOP}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 5mm 6mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      background: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .tickets-grid {
      display: grid;
      grid-template-columns: 98mm 98mm;
      grid-auto-rows: 53mm;
      gap: 2mm 2mm;
      width: 198mm;
      margin: 0 auto;
    }
    .ticket-card {
      width: 98mm;
      max-width: 98mm;
      height: 53mm;
      max-height: 53mm;
      box-sizing: border-box;
      overflow: hidden;
      border: 1px dashed #b0b0b0;
      padding: 6px 10px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .ticket-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      width: 100%;
    }
    .model-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #000000;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60%;
    }
    .machine-badge {
      background: #000000;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 900;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .sub-header-box {
      border: 1.5px solid #000000;
      text-align: center;
      padding: 1.5px 0;
      margin-bottom: 3px;
      width: 100%;
    }
    .sub-header-box span {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #000000;
    }
    .barcode-container {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      margin: 2px 0;
    }
    .barcode-container svg {
      max-width: 95%;
      max-height: 34px;
      height: auto;
    }
    .barcode-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 9.5px;
      font-weight: 900;
      letter-spacing: 1.2px;
      margin-top: 2px;
      color: #000000;
    }
    .pieces-inline-section {
      font-size: 8px;
      color: #333333;
      margin: 1px 0;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
    }
    .pieces-label {
      font-weight: 900;
      color: #000000;
      margin-right: 4px;
    }
    .pieces-list {
      font-weight: 600;
      color: #222222;
      text-transform: uppercase;
    }
    .ticket-footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #666666;
      border-top: 1px solid #f0f0f0;
      padding-top: 2px;
      width: 100%;
    }
    .footer-left {
      color: #666666;
      white-space: nowrap;
    }
    .footer-center {
      font-weight: 700;
      color: #222222;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 50%;
    }
    .footer-right {
      color: #666666;
      white-space: nowrap;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .tickets-grid {
        width: 198mm;
      }
    }
  </style>
</head>
<body>
  <div class="tickets-grid">
    ${ticketCardsHtml}
  </div>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.open()
      printWindow.document.write(fullPrintHtml)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 400)
    } else {
      addToast('error', 'Bloqueador de pop-ups impediu a janela de impressão.')
    }
  } catch (err) {
    console.error('[imprimirTicketsCorte] Erro ao gerar tickets de corte:', err)
    addToast('error', 'Falha ao gerar tickets de corte.')
  } finally {
    loadingTicketsId.value = null
  }
}

async function openTimeline(ordem: OrdemTeste) {
  timelineOrdem.value = ordem
  timelineData.value = []
  showTimeline.value = true
  loadingTimeline.value = true
  try {
    const { data } = await api.get<HistoricoResponse>(`/rastreamentos/historico/${ordem.id}`)
    timelineData.value = data.historico ?? []
  } catch {
    addToast('error', 'Erro ao carregar histórico de rastreamento.')
    showTimeline.value = false
  } finally {
    loadingTimeline.value = false
  }
}

function closeTimeline() {
  showTimeline.value = false
  timelineOrdem.value = null
  timelineData.value = []
}

// Config visual dos status de rastreamento
const rastreamentoStatusConfig: Record<string, { label: string; cls: string; dotCls: string }> = {
  EM_PROCESSO:   { label: 'Em Processo',    cls: 'rstat--amber',  dotCls: 'rdot--amber'  },
  CONCLUIDO:     { label: 'Concluído',       cls: 'rstat--green',  dotCls: 'rdot--green'  },
  REPROVADO:     { label: 'Reprovado',       cls: 'rstat--red',    dotCls: 'rdot--red'    },
  EM_RETRABALHO: { label: 'Em Retrabalho',  cls: 'rstat--orange', dotCls: 'rdot--orange' },
}

function getRastreamentoStatus(s: string) {
  return rastreamentoStatusConfig[s] ?? { label: s, cls: 'rstat--slate', dotCls: 'rdot--slate' }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatPermanencia(min: number | null) {
  if (min === null || min === undefined) return null
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ─── Modal de Manutenção e Remanejamento ─────────────────────────────────────
const canEditSla = computed(() => authStore.isAdmin.value || authStore.isModelista.value)

export interface SlaSetorFormItem {
  setorKey: string
  setorNome: string
  valor: number
  unidade: 'min' | 'h' | 'd'
}

function hydratateReverseSla(minutos: number): { valor: number; unidade: 'min' | 'h' | 'd' } {
  const min = Number(minutos) || 0
  if (min <= 0) {
    return { valor: 0, unidade: 'min' }
  }
  if (min % 1440 === 0 && min >= 1440) {
    return { valor: min / 1440, unidade: 'd' }
  }
  if (min % 60 === 0 && min >= 60) {
    return { valor: min / 60, unidade: 'h' }
  }
  return { valor: min, unidade: 'min' }
}

const showManutencaoModal = ref(false)
const manutencaoOrdem = ref<OrdemTeste | null>(null)
const activeTabManutencao = ref<'geral' | 'pecas' | 'auditoria'>('geral')
const loadingAuditoria = ref(false)
const logsAuditoria = ref<Array<{
  id: string
  acao: string
  entidadeTipo: string
  dadosAnteriores: Record<string, any> | null
  dadosNovos: Record<string, any> | null
  ipAddress: string | null
  criadoEm: string
  usuario: { id: string; nome: string } | null
}>>([])
const loadingManutencao = ref(false)
const formManutencao = ref({
  dataPrevistaProducao: '',
  slas: [] as SlaSetorFormItem[],
  pecas: [] as Array<{ id: string; nome: string; setorCorteOpcaoId: string }>
})
const maquinasCorteManutencao = ref<Array<{ id: string; label: string; valor: string }>>([])

async function abrirManutencao(ordem: OrdemTeste) {
  manutencaoOrdem.value = ordem
  activeTabManutencao.value = 'geral'

  let dtStr = ''
  if (ordem.dataPrevistaProducao) {
    const d = new Date(ordem.dataPrevistaProducao)
    dtStr = d.toISOString().slice(0, 16)
  }

  // Fonte primaria: SLAs proprios da ordem
  const ordemSlaMap: Record<string, number> = ordem.slasPorSetor || {}

  // Fonte secundaria: herda do modelo (rota ou modelo.slasPorSetor)
  const modeloSlaMap: Record<string, number> =
    (ordem as any).modelo?.rota?.slasPorSetor ||
    (ordem as any).modelo?.slasPorSetor ||
    {}

  // Setores industriais reais do chao de fabrica (sem 'default')
  const standardSectors = [
    'Conferencia Inicial',
    'Corte Recebimento',
    'Serigrafia',
    'Apoio',
    'Costura',
    'Montagem',
    'Vulcanizado',
    'Laboratorio'
  ]

  // Coleta chaves reais: da ordem + do modelo, excluindo 'default'
  const sectorKeys = new Set<string>(standardSectors)
  Object.keys(ordemSlaMap).forEach(k => { if (k !== 'default') sectorKeys.add(k) })
  Object.keys(modeloSlaMap).forEach(k => { if (k !== 'default') sectorKeys.add(k) })

  const slasItems: SlaSetorFormItem[] = []
  sectorKeys.forEach(key => {
    // Prioridade 1: SLA proprio da ordem; Prioridade 2: herda do modelo; Prioridade 3: zero
    const rawMin = ordemSlaMap[key] ?? modeloSlaMap[key]

    if (rawMin !== undefined && rawMin !== null) {
      const { valor, unidade } = hydratateReverseSla(rawMin)
      slasItems.push({ setorKey: key, setorNome: key, valor, unidade })
    } else {
      slasItems.push({ setorKey: key, setorNome: key, valor: 0, unidade: 'min' })
    }
  })

  let pecasList = ordem.modelo?.pecas || []
  if (pecasList.length === 0 && ordem.modeloId) {
    try {
      const resMod = await api.get(`/admin/modelos/${ordem.modeloId}`)
      const m = resMod.data.modelo || resMod.data
      if (m && Array.isArray(m.pecas)) {
        pecasList = m.pecas
      }
    } catch (err) {
      console.warn('[abrirManutencao] Erro ao buscar peças dinâmicas:', err)
    }
  }

  formManutencao.value = {
    dataPrevistaProducao: dtStr,
    slas: slasItems,
    pecas: pecasList.map(p => ({
      id: p.id,
      nome: p.nome,
      setorCorteOpcaoId: (p as any).setorCorteOpcaoId || (p as any).setorCorteOpcao?.id || ''
    }))
  }

  try {
    const res = await api.get<any[]>('/config/opcoes/subsetor_corte').catch(() =>
      api.get<any[]>('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } })
    )
    maquinasCorteManutencao.value = (res.data || []).map((m: any) => ({
      id: m.id,
      label: m.label || m.valor,
      valor: m.valor
    }))
  } catch (err) {
    console.error('[abrirManutencao] Erro ao buscar máquinas de corte:', err)
  }

  showManutencaoModal.value = true
}

async function loadAuditoria() {
  activeTabManutencao.value = 'auditoria'
  if (!manutencaoOrdem.value) return
  loadingAuditoria.value = true
  logsAuditoria.value = []
  try {
    const res = await api.get(`/lotes/${manutencaoOrdem.value.id}/auditoria`)
    logsAuditoria.value = res.data || []
  } catch (err) {
    console.error('[loadAuditoria] Erro ao buscar historico de auditoria:', err)
    logsAuditoria.value = []
  } finally {
    loadingAuditoria.value = false
  }
}

async function salvarManutencao() {
  if (!manutencaoOrdem.value) return
  loadingManutencao.value = true
  try {
    const payload: any = {
      dataPrevistaProducao: formManutencao.value.dataPrevistaProducao || null,
      pecas: formManutencao.value.pecas.map(p => ({
        id: p.id,
        setorCorteOpcaoId: p.setorCorteOpcaoId
      }))
    }

    if (canEditSla.value) {
      const slasPorSetorPayload: Record<string, number> = {}
      // Serializa os SLAs editados (exclui itens com valor 0 para nao poluir)
      for (const item of formManutencao.value.slas) {
        let min = Number(item.valor) || 0
        if (item.unidade === 'd') min *= 1440
        else if (item.unidade === 'h') min *= 60
        if (min > 0) slasPorSetorPayload[item.setorKey] = min
      }

      payload.slasPorSetor = slasPorSetorPayload
    }

    const response = await api.put(`/ordens-teste/${manutencaoOrdem.value.id}/manutencao`, payload)

    const loteAtualizado = response.data.lote || response.data
    const idx = ordens.value.findIndex(o => o.id === loteAtualizado.id)
    if (idx !== -1) {
      ordens.value[idx] = { ...ordens.value[idx], ...loteAtualizado }
    }

    addToast('success', 'Manutenção da Ordem salva com sucesso!')
    showManutencaoModal.value = false
  } catch (err: any) {
    console.error('[salvarManutencao] Erro:', err)
    addToast('error', err.response?.data?.error || 'Erro ao salvar manutenção.')
  } finally {
    loadingManutencao.value = false
  }
}

// ─── Formulário ──────────────────────────────────────────────────────────────
const form = ref({
  modeloId: '',
  plantaId: '',
  prioridadePcp: '',
  observacoes: '',
  possuiCaixaTeste: false,
})
const formErrors = ref<Record<string, string>>({})

// ─── Helpers de Status ───────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; cls: string }> = {
  AGUARDANDO_MATERIAL:        { label: 'Aguardando Material',    cls: 'badge--amber' },
  CONFERENCIA_INICIAL:        { label: 'Conferência Inicial',    cls: 'badge--blue' },
  AGUARDANDO_VALIDACAO:       { label: 'Aguardando Validação',   cls: 'badge--amber' },
  EM_CORTE:                   { label: 'Em Corte',               cls: 'badge--blue' },
  INSPECAO_QUALIDADE:         { label: 'Inspeção Qualidade',     cls: 'badge--violet' },
  EM_RETRABALHO:              { label: 'Em Retrabalho',          cls: 'badge--orange' },
  SERIGRAFIA:                 { label: 'Serigrafia',             cls: 'badge--blue' },
  APOIO:                      { label: 'Apoio',                  cls: 'badge--blue' },
  BORDADO:                    { label: 'Bordado',                cls: 'badge--blue' },
  COSTURA_PROGRAMADA:         { label: 'Costura Programada',     cls: 'badge--blue' },
  COSTURA:                    { label: 'Costura',                cls: 'badge--blue' },
  PRE_FABRICADO:              { label: 'Pré-fabricado',          cls: 'badge--blue' },
  MONTAGEM:                   { label: 'Montagem',               cls: 'badge--indigo' },
  VULCANIZADO:                { label: 'Vulcanizado',            cls: 'badge--indigo' },
  LABORATORIO:                { label: 'Laboratório',            cls: 'badge--violet' },
  AGUARDANDO_RESULTADO_FINAL: { label: 'Aguardando Resultado',   cls: 'badge--amber' },
  APROVACAO_CONCESSAO:        { label: 'Aprovação/Concessão',    cls: 'badge--amber' },
  APROVADO:                   { label: 'Aprovado',               cls: 'badge--green' },
  REPROVADO:                  { label: 'Reprovado',              cls: 'badge--red' },
  LIBERADO_PRODUCAO:          { label: 'Liberado Produção',      cls: 'badge--green' },
}

const prioridadeConfig: Record<string, { label: string; cls: string }> = {
  ALTA:  { label: 'Alta',  cls: 'badge--red' },
  MEDIA: { label: 'Média', cls: 'badge--amber' },
  BAIXA: { label: 'Baixa', cls: 'badge--slate' },
}

function getStatus(s: string) {
  return statusConfig[s] ?? { label: s, cls: 'badge--slate' }
}
function getPrioridade(p: string) {
  return prioridadeConfig[p] ?? { label: p, cls: 'badge--slate' }
}

// ─── Computed ────────────────────────────────────────────────────────────────
const filteredOrdens = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return ordens.value
  return ordens.value.filter(
    (o) =>
      o.codigoBarras.toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q) ||
      o.prioridadePcp.toLowerCase().includes(q)
  )
})

const stats = computed(() => ({
  total: ordens.value.length,
  emAndamento: ordens.value.filter(
    (o) => !['APROVADO', 'REPROVADO', 'LIBERADO_PRODUCAO'].includes(o.status)
  ).length,
  aprovados: ordens.value.filter((o) => o.status === 'APROVADO' || o.status === 'LIBERADO_PRODUCAO').length,
  alta: ordens.value.filter((o) => o.prioridadePcp === 'ALTA').length,
}))

// ─── Toast ───────────────────────────────────────────────────────────────────
function addToast(type: 'success' | 'error', message: string) {
  const id = ++toastCounter
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

// ─── Requisições ─────────────────────────────────────────────────────────────
async function fetchOrdens() {
  loading.value = true
  try {
    const { data } = await api.get<OrdemTeste[]>('/lotes')
    ordens.value = data
  } catch {
    addToast('error', 'Erro ao carregar ordens de produção.')
  } finally {
    loading.value = false
  }
}

async function fetchDropdownData() {
  try {
    const [resModelos, resPlantas, resCatalogo] = await Promise.all([
      // Endpoint filtrado: retorna apenas modelos SEM ordem de teste (regra 1:1)
      api.get<Modelo[]>('/admin/modelos'),
      api.get<Planta[]>('/admin/plantas'),
      api.get<Modelo[]>('/admin/modelos/catalogo'),
    ])
    modelos.value = resModelos.data
    plantas.value = resPlantas.data
    catalogoModelos.value = resCatalogo.data
  } catch {
    addToast('error', 'Erro ao carregar opções do formulário.')
  }
}

async function handleCreateOrdem() {
  formErrors.value = {}

  if (!form.value.modeloId)      formErrors.value.modeloId = 'Selecione um modelo.'
  if (!form.value.plantaId)      formErrors.value.plantaId = 'Selecione uma planta.'
  if (!form.value.prioridadePcp) formErrors.value.prioridadePcp = 'Selecione a prioridade.'

  if (Object.keys(formErrors.value).length > 0) return

  loadingCreate.value = true
  try {
    await api.post('/lotes', {
      modeloId:      form.value.modeloId,
      plantaId:      form.value.plantaId,
      prioridadePcp: form.value.prioridadePcp,
      observacoes:   form.value.observacoes || null,
      possuiCaixaTeste: form.value.possuiCaixaTeste,
    })
    addToast('success', 'Ordem de teste criada com sucesso.')
    // Recarrega dropdown para remover o modelo que agora tem ordem ativa
    await Promise.all([fetchOrdens(), fetchDropdownData()])
    closeModal()
  } catch (err: any) {
    const code = err?.response?.data?.code
    const serverMsg = err?.response?.data?.error

    // Trata o erro específico da regra 1:1
    if (code === 'MODELO_TESTE_DUPLICADO') {
      const cb = err?.response?.data?.codigoBarras
      addToast('error', cb
        ? `Este modelo já possui a ordem ativa: ${cb}. Cada modelo admite apenas um teste de produção.`
        : 'Este modelo já possui um teste de produção ativo. Regra 1:1.'
      )
    } else {
      addToast('error', typeof serverMsg === 'string'
        ? serverMsg
        : 'Erro ao criar ordem. Verifique os dados e tente novamente.'
      )
    }
  } finally {
    loadingCreate.value = false
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal() {
  form.value = { modeloId: '', plantaId: '', prioridadePcp: '', observacoes: '', possuiCaixaTeste: false }
  formErrors.value = {}
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchOrdens(), fetchDropdownData()])
})
</script>

<template>
  <div class="go-root">

    <!-- ── Toast Stack ────────────────────────────────────── -->
    <Teleport to="body">
      <div class="toast-stack" aria-live="polite">
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="toast"
            :class="toast.type === 'success' ? 'toast--success' : 'toast--error'"
            role="alert"
          >
            <CheckCircle2 v-if="toast.type === 'success'" :size="16" class="toast-icon" aria-hidden="true" />
            <XCircle      v-else                          :size="16" class="toast-icon" aria-hidden="true" />
            <span class="toast-msg">{{ toast.message }}</span>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- ── PAGE HEADER ────────────────────────────────────── -->
    <header class="go-header">
      <div class="go-header-left">
        <div class="page-icon-wrap" aria-hidden="true">
          <ClipboardList :size="20" />
        </div>
        <div>
          <h1 class="go-title">Gestão de Ordens de Teste</h1>
          <p class="go-subtitle">Crie e acompanhe as ordens de produção que geram códigos de barras para o chão de fábrica.</p>
        </div>
      </div>
      <div class="go-header-actions">
        <button
          id="btn-refresh-ordens"
          type="button"
          class="btn-ghost"
          :disabled="loading"
          @click="fetchOrdens"
          aria-label="Recarregar ordens"
        >
          <RefreshCw :size="15" :class="{ 'spin-anim': loading }" aria-hidden="true" />
        </button>
        <button
          id="btn-nova-ordem"
          type="button"
          class="btn-primary"
          @click="openModal"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>Nova Ordem de Teste</span>
        </button>
      </div>
    </header>

    <!-- ── KPI STRIP ──────────────────────────────────────── -->
    <section class="kpi-strip" aria-label="Estatísticas de ordens">
      <div class="kpi-card">
        <BarChart3 :size="18" class="kpi-icon" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.total }}</span>
          <span class="kpi-lbl">Total</span>
        </div>
      </div>
      <div class="kpi-card">
        <RefreshCw :size="18" class="kpi-icon kpi-icon--blue" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.emAndamento }}</span>
          <span class="kpi-lbl">Em Andamento</span>
        </div>
      </div>
      <div class="kpi-card">
        <CheckCircle2 :size="18" class="kpi-icon kpi-icon--green" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.aprovados }}</span>
          <span class="kpi-lbl">Aprovadas</span>
        </div>
      </div>
      <div class="kpi-card">
        <AlertCircle :size="18" class="kpi-icon kpi-icon--red" aria-hidden="true" />
        <div class="kpi-data">
          <span class="kpi-val">{{ stats.alta }}</span>
          <span class="kpi-lbl">Prioridade Alta</span>
        </div>
      </div>
    </section>

    <!-- ── TOOLBAR ────────────────────────────────────────── -->
    <div class="go-toolbar">
      <div class="search-wrap">
        <Search :size="15" class="search-icon" aria-hidden="true" />
        <input
          id="input-search-ordens"
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Buscar por código, status ou prioridade..."
          aria-label="Buscar ordens"
        />
      </div>
    </div>

    <!-- ── TABLE ──────────────────────────────────────────── -->
    <div class="table-card">
      <!-- Loading skeleton -->
      <div v-if="loading" class="table-loading" aria-label="Carregando ordens...">
        <div v-for="i in 5" :key="i" class="skeleton-row">
          <div class="skel skel--code"></div>
          <div class="skel skel--mid"></div>
          <div class="skel skel--short"></div>
          <div class="skel skel--short"></div>
          <div class="skel skel--short"></div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredOrdens.length === 0" class="table-empty">
        <Package :size="40" class="empty-icon" aria-hidden="true" />
        <p class="empty-title">Nenhuma ordem encontrada</p>
        <p class="empty-sub">Crie a primeira ordem de teste clicando em "Nova Ordem de Teste".</p>
      </div>

      <!-- Data table -->
      <div v-else class="table-outer" role="region" aria-label="Tabela de ordens de produção">
        <table class="go-table">
          <thead>
            <tr>
              <th scope="col">Código de Barras</th>
              <th scope="col">ID do Modelo</th>
              <th scope="col" class="text-center">Prioridade PCP</th>
              <th scope="col" class="text-center">Status</th>
              <th scope="col" class="text-center">Liberado</th>
              <th scope="col">Criado em</th>
              <th scope="col" class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ordem in filteredOrdens" :key="ordem.id" class="go-row">
              <td>
                <span class="barcode-cell">{{ ordem.codigoBarras }}</span>
              </td>
              <td>
                <div class="model-info-cell">
                  <strong class="model-name-text">{{ getModeloNome(ordem.modeloId) }}</strong>
                  <span class="model-ref-sub">Ref: {{ getModeloReferencia(ordem.modeloId) }}</span>
                </div>
              </td>
              <td class="text-center">
                <span class="badge" :class="getPrioridade(ordem.prioridadePcp).cls">
                  {{ getPrioridade(ordem.prioridadePcp).label }}
                </span>
              </td>
              <td class="text-center">
                <span class="badge" :class="getStatus(ordem.status).cls">
                  {{ getStatus(ordem.status).label }}
                </span>
              </td>
              <td class="text-center">
                <span
                  class="liberado-dot"
                  :class="ordem.liberadoProducao ? 'liberado-dot--yes' : 'liberado-dot--no'"
                  :aria-label="ordem.liberadoProducao ? 'Liberado para produção' : 'Não liberado'"
                ></span>
              </td>
              <td class="date-cell">{{ formatDate(ordem.createdAt) }}</td>
              <td class="text-center">
                <div class="actions-flex">
                  <button
                    :id="`btn-timeline-${ordem.id}`"
                    type="button"
                    class="btn-action-timeline"
                    @click="openTimeline(ordem)"
                    :aria-label="`Ver timeline de rastreamento da ordem ${ordem.codigoBarras}`"
                    title="Ver Timeline de Rastreamento"
                  >
                    <Activity :size="14" aria-hidden="true" />
                    <span>Timeline</span>
                  </button>
                  <button
                    type="button"
                    class="btn-action-timeline"
                    style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid #bae6fd;"
                    @click="router.push({ name: 'rastreamento-ordem', params: { ordemTesteId: ordem.id } })"
                    title="Ver Rastreamento Dual Dinâmico"
                  >
                    <Activity :size="14" aria-hidden="true" />
                    <span>Rastrear Dual</span>
                  </button>
                  <button
                    type="button"
                    class="btn-action-timeline"
                    style="background: #f1f5f9; color: #334155; border-color: #cbd5e1; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid #cbd5e1;"
                    @click="abrirManutencao(ordem)"
                    title="Manutenção da Ordem (SLAs e Remanejamento)"
                  >
                    <Settings :size="14" aria-hidden="true" />
                    <span>Manutenção</span>
                  </button>
                  <button
                    type="button"
                    class="btn-action-print"
                    style="background: #f8fafc; color: #0f172a; border-color: #cbd5e1; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid #cbd5e1;"
                    @click="imprimirTicketsCorte(ordem)"
                    :disabled="loadingTicketsId === ordem.id"
                    :aria-label="`Imprimir tickets físicos de corte da ordem ${ordem.codigoBarras}`"
                    title="Imprimir Tickets Físicos de Corte (Baixa por Máquina)"
                  >
                    <Loader2 v-if="loadingTicketsId === ordem.id" :size="14" class="spin-anim" aria-hidden="true" />
                    <Printer v-else :size="14" aria-hidden="true" />
                    <span>{{ loadingTicketsId === ordem.id ? 'Gerando...' : 'Tickets Corte' }}</span>
                  </button>
                  <template v-if="ordem.possuiCaixaTeste">
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'LOTE_PRINCIPAL')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` || loadingPdfId === `${ordem.id}-CAIXA_TESTE`"
                      :aria-label="`Imprimir etiqueta de lote da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Lote"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` ? 'Gerando...' : 'Lote' }}</span>
                    </button>
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'CAIXA_TESTE')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` || loadingPdfId === `${ordem.id}-CAIXA_TESTE`"
                      :aria-label="`Imprimir etiqueta de caixa teste da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Caixa Teste"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-CAIXA_TESTE`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-CAIXA_TESTE` ? 'Gerando...' : 'Caixa Teste' }}</span>
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="btn-action-print"
                      @click="imprimirOrdem(ordem, 'LOTE_PRINCIPAL')"
                      :disabled="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`"
                      :aria-label="`Imprimir etiqueta da ordem ${ordem.codigoBarras}`"
                      title="Imprimir Lote"
                    >
                      <Loader2 v-if="loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL`" :size="14" class="animate-spin" aria-hidden="true" />
                      <Printer v-else :size="14" aria-hidden="true" />
                      <span>{{ loadingPdfId === `${ordem.id}-LOTE_PRINCIPAL` ? 'Gerando...' : 'Imprimir' }}</span>
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer count -->
      <div v-if="!loading && filteredOrdens.length > 0" class="table-footer">
        <span>{{ filteredOrdens.length }} ordem{{ filteredOrdens.length !== 1 ? 's' : '' }} exibida{{ filteredOrdens.length !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         MODAL — NOVA ORDEM DE TESTE
    ══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-ordens"
          @click.self="closeModal"
        >
          <div class="modal-panel">
            <!-- Modal Header -->
            <div class="modal-header">
              <div class="modal-header-left">
                <div class="modal-icon-wrap" aria-hidden="true">
                  <Plus :size="18" />
                </div>
                <h2 id="modal-title-ordens" class="modal-title">Nova Ordem de Teste</h2>
              </div>
              <button
                id="btn-close-modal-ordens"
                type="button"
                class="modal-close"
                @click="closeModal"
                aria-label="Fechar modal"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <!-- Modal Body -->
            <div class="modal-body">
              <p class="modal-description">
                Selecione o modelo de calçado, a planta industrial e a prioridade PCP para gerar automaticamente o código de barras da ordem de rastreamento.
              </p>

              <!-- Modelo -->
              <div class="form-field">
                <label for="sel-modelo" class="form-label">
                  Modelo de Calçado <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-modelo"
                    v-model="form.modeloId"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.modeloId }"
                  >
                    <option value="" disabled>Selecione um modelo...</option>
                    <option v-for="m in modelos" :key="m.id" :value="m.id">
                      {{ m.codigoProduto }} — {{ m.nome }}
                    </option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.modeloId" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.modeloId }}
                </span>
              </div>

              <!-- Planta -->
              <div class="form-field">
                <label for="sel-planta" class="form-label">
                  Planta Industrial <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-planta"
                    v-model="form.plantaId"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.plantaId }"
                  >
                    <option value="" disabled>Selecione uma planta...</option>
                    <option v-for="p in plantas" :key="p.id" :value="p.id">
                      {{ p.nome }}<template v-if="p.cidade"> — {{ p.cidade }}{{ p.estado ? `/${p.estado}` : '' }}</template>
                    </option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.plantaId" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.plantaId }}
                </span>
              </div>

              <!-- Prioridade PCP -->
              <div class="form-field">
                <label for="sel-prioridade" class="form-label">
                  Prioridade PCP <span class="required-star" aria-hidden="true">*</span>
                </label>
                <div class="select-wrap">
                  <select
                    id="sel-prioridade"
                    v-model="form.prioridadePcp"
                    class="form-select"
                    :class="{ 'form-select--error': formErrors.prioridadePcp }"
                  >
                    <option value="" disabled>Selecione a prioridade...</option>
                    <option value="ALTA">Alta — Entrega urgente</option>
                    <option value="MEDIA">Média — Prazo padrão</option>
                    <option value="BAIXA">Baixa — Sem urgência</option>
                  </select>
                  <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
                </div>
                <span v-if="formErrors.prioridadePcp" class="form-error" role="alert">
                  <AlertCircle :size="12" aria-hidden="true" />
                  {{ formErrors.prioridadePcp }}
                </span>
              </div>

              <!-- Possui Caixa Teste -->
              <div class="form-field toggle-field" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 16px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <label for="chk-caixa-teste" style="font-weight: 600; color: #1e293b; font-size: 0.875rem; margin: 0; cursor: pointer;">
                    Bifurcação de Fluxo (Caixa Teste)
                  </label>
                  <span style="font-size: 0.75rem; color: #64748b;">
                    Gera lote principal e caixa de teste separados.
                  </span>
                </div>
                <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                  <input type="checkbox" id="chk-caixa-teste" v-model="form.possuiCaixaTeste" style="opacity: 0; width: 0; height: 0;">
                  <span class="slider round" :style="{ backgroundColor: form.possuiCaixaTeste ? '#0284c7' : '#cbd5e1', position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, transition: '.4s', borderRadius: '34px' }">
                    <span style="position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.4s; border-radius: 50%;" :style="form.possuiCaixaTeste ? 'transform: translateX(20px);' : ''"></span>
                  </span>
                </label>
              </div>

              <!-- Observações (opcional) -->
              <div class="form-field">
                <label for="txt-observacoes" class="form-label">Observações <span class="optional-tag">opcional</span></label>
                <textarea
                  id="txt-observacoes"
                  v-model="form.observacoes"
                  class="form-textarea"
                  placeholder="Anotações adicionais sobre esta ordem..."
                  rows="3"
                ></textarea>
              </div>

              <!-- Info tip -->
              <div class="info-tip" role="note">
                <AlertCircle :size="14" class="tip-icon" aria-hidden="true" />
                <span>O código de barras será gerado automaticamente. Apenas modelos <strong>sem teste ativo</strong> aparecem na lista (regra 1:1).</span>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="modal-footer">
              <button
                id="btn-cancel-ordem"
                type="button"
                class="btn-outline"
                @click="closeModal"
                :disabled="loadingCreate"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-ordem"
                type="button"
                class="btn-primary"
                @click="handleCreateOrdem"
                :disabled="loadingCreate"
              >
                <Loader2 v-if="loadingCreate" :size="15" class="spin-anim" aria-hidden="true" />
                <Plus v-else :size="15" aria-hidden="true" />
                <span>{{ loadingCreate ? 'Criando Ordem...' : 'Confirmar e Criar' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ══════════════════════════════════════════════════════
         DRAWER — TIMELINE DE RASTREAMENTO
    ══════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="showTimeline"
          class="tl-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tl-drawer-title"
          @click.self="closeTimeline"
        >
          <aside class="tl-drawer">

            <!-- Drawer Header -->
            <div class="tl-header">
              <div class="tl-header-left">
                <div class="tl-icon-wrap" aria-hidden="true">
                  <Activity :size="18" />
                </div>
                <div>
                  <h2 id="tl-drawer-title" class="tl-title">Timeline de Rastreamento</h2>
                  <p class="tl-subtitle" v-if="timelineOrdem">
                    Ordem
                    <span class="tl-code">{{ timelineOrdem.codigoBarras }}</span>
                  </p>
                </div>
              </div>
              <button
                id="btn-close-timeline"
                type="button"
                class="tl-close"
                @click="closeTimeline"
                aria-label="Fechar timeline"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <!-- Drawer Body -->
            <div class="tl-body">

              <!-- Loading state -->
              <div v-if="loadingTimeline" class="tl-loading" aria-label="Carregando rastreamentos...">
                <div v-for="i in 4" :key="i" class="tl-skel-row">
                  <div class="tl-skel-dot"></div>
                  <div class="tl-skel-content">
                    <div class="tl-skel tl-skel--title"></div>
                    <div class="tl-skel tl-skel--sub"></div>
                    <div class="tl-skel tl-skel--sub"></div>
                  </div>
                </div>
              </div>

              <!-- Empty state -->
              <div v-else-if="timelineData.length === 0" class="tl-empty">
                <MapPin :size="32" class="tl-empty-icon" aria-hidden="true" />
                <p class="tl-empty-title">Nenhum rastreamento registrado</p>
                <p class="tl-empty-sub">A bipagem das peças nesta ordem ainda não foi iniciada no chão de fábrica.</p>
              </div>

              <!-- Timeline list -->
              <ol v-else class="tl-list" aria-label="Histórico de rastreamento por setor">
                <li
                  v-for="(item, idx) in timelineData"
                  :key="item.id"
                  class="tl-item"
                >
                  <!-- Conector vertical (oculta no último) -->
                  <div class="tl-connector" :class="{ 'tl-connector--hidden': idx === timelineData.length - 1 }" aria-hidden="true"></div>

                  <!-- Bolha de status -->
                  <div
                    class="tl-dot"
                    :class="getRastreamentoStatus(item.status).dotCls"
                    :aria-label="getRastreamentoStatus(item.status).label"
                  ></div>

                  <!-- Card do rastreamento -->
                  <div class="tl-card">
                    <!-- Setor + badge -->
                    <div class="tl-card-header">
                      <div class="tl-setor-wrap">
                        <MapPin :size="12" class="tl-setor-icon" aria-hidden="true" />
                        <span class="tl-setor-nome">{{ item.setor?.nome ?? 'Setor desconhecido' }}</span>
                        <span v-if="item.setor?.tipoSetor" class="tl-tipo-setor">{{ item.setor.tipoSetor }}</span>
                      </div>
                      <span class="tl-badge" :class="getRastreamentoStatus(item.status).cls">
                        {{ getRastreamentoStatus(item.status).label }}
                      </span>
                    </div>

                    <!-- Tipo de lote -->
                    <div class="tl-lote-tag">
                      <ChevronRight :size="10" aria-hidden="true" />
                      {{ item.tipoLote === 'CAIXA_TESTE' ? 'Caixa Teste' : 'Lote Principal' }}
                    </div>

                    <!-- Máquina / Estação Utilizada -->
                    <div v-if="item.estacao" class="tl-maquina-tag">
                      <Sliders :size="12" class="tl-maquina-icon" aria-hidden="true" />
                      <span class="tl-maquina-label">Máquina:</span>
                      <span class="tl-maquina-val font-semibold">{{ item.estacao.codigo || item.estacao.nome }}</span>
                    </div>

                    <!-- Datas -->
                    <div class="tl-dates">
                      <div class="tl-date-row">
                        <LogIn :size="12" class="tl-date-icon" aria-hidden="true" />
                        <span class="tl-date-label">Entrada:</span>
                        <span class="tl-date-val">{{ formatDateTime(item.dataEntrada) }}</span>
                      </div>
                      <div class="tl-date-row">
                        <LogOut :size="12" class="tl-date-icon" aria-hidden="true" />
                        <span class="tl-date-label">Saída:</span>
                        <span class="tl-date-val">{{ formatDateTime(item.dataSaida) }}</span>
                      </div>
                    </div>

                    <!-- Tempo de permanência em Tempo Real -->
                    <div v-if="formatPermanencia(item.tempoPermanenciaMin)" class="tl-permanencia">
                      <Timer :size="12" class="tl-perm-icon" aria-hidden="true" />
                      <span class="tl-perm-label">Permanência Real:</span>
                      <span class="tl-perm-val font-bold text-indigo-700">{{ formatPermanencia(item.tempoPermanenciaMin) }}</span>
                    </div>

                    <!-- Operadores (Modo Quiosque / Crachá) -->
                    <div v-if="item.operadorEntrada || item.operadorSaida" class="tl-operadores">
                      <div class="tl-op-header">
                        <User :size="12" class="tl-op-icon" aria-hidden="true" />
                        <span class="tl-op-title font-semibold">Operadores (Crachá):</span>
                      </div>
                      <div class="tl-op-list">
                        <span v-if="item.operadorEntrada">
                          <span class="tl-op-tag">Entrada:</span> {{ item.operadorEntrada.nomeCompleto }}
                        </span>
                        <span v-if="item.operadorEntrada && item.operadorSaida" class="tl-op-sep">|</span>
                        <span v-if="item.operadorSaida">
                          <span class="tl-op-tag">Saída:</span> {{ item.operadorSaida.nomeCompleto }}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              </ol>

            </div>

            <!-- Drawer Footer -->
            <div class="tl-footer">
              <div class="tl-footer-info" v-if="!loadingTimeline && timelineData.length > 0">
                <Info :size="13" aria-hidden="true" />
                <span>{{ timelineData.length }} rastreamento{{ timelineData.length !== 1 ? 's' : '' }} registrado{{ timelineData.length !== 1 ? 's' : '' }}</span>
              </div>
              <button
                id="btn-fechar-timeline-footer"
                type="button"
                class="btn-outline"
                @click="closeTimeline"
              >
                Fechar
              </button>
            </div>

          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- ══════════════════════════════════════════════════════
         MODAL — MANUTENÇÃO DA ORDEM & REMANEJAMENTO DE PEÇAS
    ══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showManutencaoModal"
          class="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-manutencao"
          @click.self="showManutencaoModal = false"
        >
          <div class="modal-panel modal-panel--manutencao">
            <div class="modal-header">
              <div class="modal-header-left">
                <div class="modal-icon-wrap" aria-hidden="true">
                  <Settings :size="20" class="text-indigo-600" />
                </div>
                <div>
                  <h2 id="modal-title-manutencao" class="modal-title">Manutenção da Ordem {{ manutencaoOrdem?.codigoBarras }}</h2>
                  <p class="modal-description">Edite prazos, metas de tempo (SLA) ou altere a máquina de peças técnicas.</p>
                </div>
              </div>
              <button
                type="button"
                class="modal-close"
                aria-label="Fechar modal"
                @click="showManutencaoModal = false"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </div>

            <!-- Abas do Modal -->
            <div class="flex items-center gap-1 px-5 pt-3 border-b border-white/8 bg-zinc-900/60 overflow-x-auto">
              <button
                type="button"
                class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
                :class="activeTabManutencao === 'geral' ? 'border-emerald-400 text-white bg-white/5' : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/5'"
                @click="activeTabManutencao = 'geral'"
              >
                <div class="flex items-center gap-1.5">
                  <Sliders :size="13" />
                  <span>1. Prazos e SLAs</span>
                </div>
              </button>
              <button
                type="button"
                class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
                :class="activeTabManutencao === 'pecas' ? 'border-emerald-400 text-white bg-white/5' : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/5'"
                @click="activeTabManutencao = 'pecas'"
              >
                <div class="flex items-center gap-1.5">
                  <Scissors :size="13" />
                  <span>2. Remanejamento ({{ formManutencao.pecas.length }})</span>
                </div>
              </button>
              <button
                type="button"
                class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
                :class="activeTabManutencao === 'auditoria' ? 'border-emerald-400 text-white bg-white/5' : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/5'"
                @click="loadAuditoria"
              >
                <div class="flex items-center gap-1.5">
                  <History :size="13" />
                  <span>3. Historico ISO</span>
                </div>
              </button>
            </div>

            <div class="modal-body p-6 space-y-4">
              <!-- ABA 1: Prazos e SLAs -->
              <div v-if="activeTabManutencao === 'geral'" class="space-y-5">
                <!-- Campo data -->
                <div class="form-group">
                  <label for="manut-data-prevista" class="form-label flex items-center gap-1">
                    <Calendar :size="13" class="text-zinc-400" />
                    <span>Data Prevista de Inicio na Producao</span>
                  </label>
                  <input
                    id="manut-data-prevista"
                    type="datetime-local"
                    v-model="formManutencao.dataPrevistaProducao"
                    class="form-input"
                  />
                </div>

                <!-- Cabecalho SLA -->
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div class="flex items-center gap-2">
                    <Clock :size="14" class="text-zinc-400 shrink-0" />
                    <span class="text-xs font-black text-zinc-100 uppercase tracking-widest">Prazos de SLA por Setor</span>
                  </div>
                  <span
                    v-if="!canEditSla"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-white/10 text-zinc-400 text-xs font-bold"
                  >
                    <Lock :size="11" />
                    Somente leitura
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 text-xs font-bold"
                  >
                    <ShieldCheck :size="11" />
                    Edicao liberada
                  </span>
                </div>

                <!-- Grid de cards SLA por setor -->
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-1 w-full">
                  <div
                    v-for="s in formManutencao.slas"
                    :key="s.setorKey"
                    class="bg-zinc-900/30 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-colors"
                    :class="canEditSla ? 'hover:border-white/20' : 'opacity-70'"
                  >
                    <!-- Nome do setor -->
                    <div class="flex items-center justify-between min-w-0">
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        <Clock
                          :size="13"
                          class="shrink-0"
                          :class="canEditSla ? 'text-emerald-400' : 'text-zinc-500'"
                        />
                        <span
                          class="text-sm font-semibold truncate"
                          :class="canEditSla ? 'text-zinc-100' : 'text-zinc-400'"
                        >{{ s.setorNome }}</span>
                      </div>
                      <Lock v-if="!canEditSla" :size="12" class="text-amber-400 shrink-0 ml-2" />
                    </div>

                    <!-- Divisor -->
                    <div class="h-px bg-white/8"></div>

                    <!-- Controles: valor + unidade -->
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        v-model.number="s.valor"
                        :disabled="!canEditSla"
                        class="w-20 px-2 h-9 text-sm font-black font-mono text-white bg-black/50 border border-slate-700/60 rounded-lg outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <select
                        v-model="s.unidade"
                        :disabled="!canEditSla"
                        class="flex-1 min-w-[100px] h-9 px-3 py-2 text-xs font-bold text-white bg-black/50 border border-slate-700/60 rounded-lg outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="min">Minutos</option>
                        <option value="h">Horas</option>
                        <option value="d">Dias</option>
                      </select>
                    </div>

                    <!-- Equivalencia em minutos -->
                    <p class="text-xs font-semibold text-zinc-500 text-right tabular-nums">
                      = {{ s.unidade === 'd' ? s.valor * 1440 : s.unidade === 'h' ? s.valor * 60 : s.valor }} min
                    </p>
                  </div>
                </div>
              </div>
              <!-- ABA 2: Remanejamento de Pecas -->
              <div v-else-if="activeTabManutencao === 'pecas'" class="space-y-3">
                <p class="text-xs text-slate-500">
                  Altere a maquina de destino de cada peca tecnica do corte automatico:
                </p>

                <div v-if="formManutencao.pecas.length === 0" class="p-4 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs">
                  Este modelo nao possui pecas cadastradas para remanejamento.
                </div>

                <div v-else class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  <div
                    v-for="p in formManutencao.pecas"
                    :key="p.id"
                    class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div class="text-xs font-bold text-slate-800">
                      {{ p.nome }}
                    </div>
                    <div class="sm:w-64">
                      <select
                        v-model="p.setorCorteOpcaoId"
                        class="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-800"
                      >
                        <option value="">Selecione a maquina...</option>
                        <option
                          v-for="m in maquinasCorteManutencao"
                          :key="m.id"
                          :value="m.id"
                        >
                          {{ m.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ABA 3: Historico ISO -->
              <div v-else-if="activeTabManutencao === 'auditoria'" class="space-y-3">
                <!-- Loading -->
                <div v-if="loadingAuditoria" class="flex items-center justify-center py-12 gap-2">
                  <Loader2 :size="18" class="animate-spin text-emerald-500" />
                  <span class="text-slate-400 text-sm">Carregando historico...</span>
                </div>

                <!-- Vazio -->
                <div
                  v-else-if="logsAuditoria.length === 0"
                  class="p-8 text-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-2xl bg-slate-50/50"
                >
                  <History :size="28" class="mx-auto mb-2 text-slate-300" />
                  <p>Nenhum registro de auditoria encontrado para esta ordem.</p>
                </div>

                <!-- Lista de registros de auditoria -->
                <div v-else class="max-h-80 overflow-y-auto pr-1 space-y-2">
                  <div
                    v-for="log in logsAuditoria"
                    :key="log.id"
                    class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 transition-colors hover:border-emerald-300 hover:shadow-sm"
                  >
                    <!-- Cabeçalho: ação + timestamp -->
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black tracking-wider uppercase">
                        <ShieldCheck :size="10" />
                        {{ log.acao }}
                      </span>
                      <span class="text-slate-400 text-xs font-mono">
                        {{ new Date(log.criadoEm).toLocaleString('pt-BR') }}
                      </span>
                    </div>

                    <!-- Operador -->
                    <div class="flex items-center gap-2">
                      <span class="text-slate-500 text-xs font-semibold">Operador:</span>
                      <span class="text-slate-800 text-xs font-bold">{{ log.usuario?.nome || 'Sistema' }}</span>
                    </div>

                    <!-- Diff: Antes / Depois -->
                    <div v-if="log.dadosAnteriores || log.dadosNovos" class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div v-if="log.dadosAnteriores" class="bg-red-50 rounded-lg p-2.5 border border-red-100">
                        <p class="text-red-500 text-xs font-bold mb-1.5 uppercase tracking-wide">Antes</p>
                        <pre class="text-slate-600 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">{{ JSON.stringify(log.dadosAnteriores, null, 2) }}</pre>
                      </div>
                      <div v-if="log.dadosNovos" class="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                        <p class="text-emerald-600 text-xs font-bold mb-1.5 uppercase tracking-wide">Depois</p>
                        <pre class="text-emerald-800 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">{{ JSON.stringify(log.dadosNovos, null, 2) }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn-outline"
                @click="showManutencaoModal = false"
                :disabled="loadingManutencao"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="btn-primary"
                @click="salvarManutencao"
                :disabled="loadingManutencao"
              >
                <Loader2 v-if="loadingManutencao" :size="14" class="animate-spin" />
                <span>{{ loadingManutencao ? 'Salvando...' : 'Salvar Manutenção' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════
   DESIGN SYSTEM — GESTÃO DE ORDENS
   Estética: Industrial Utilitarian + Light Mode Antirreflexo
   Paleta: slate-50 base · slate-900 texto · blue-700 accent
══════════════════════════════════════════════════════ */

/* ─── Root ─────────────────────────────────────────── */
.go-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 100%;
  font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
}

/* ─── Page Header ──────────────────────────────────── */
.go-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.go-header-left {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.page-icon-wrap {
  width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.3);
}

.go-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.025em;
  line-height: 1.2;
  margin: 0;
}

.go-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.25rem 0 0;
  line-height: 1.5;
}

.go-header-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-shrink: 0;
}

/* ─── Buttons ──────────────────────────────────────── */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  font-size: 0.875rem;
  font-weight: 700;
  font-family: inherit;
  color: #fff;
  background: #0f172a;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
}

.btn-primary:hover:not(:disabled) { background: #1e293b; transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  color: #475569;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-outline:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; }
.btn-outline:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-outline:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

/* ─── KPI Strip ────────────────────────────────────── */
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.875rem;
}

@media (max-width: 900px) { .kpi-strip { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .kpi-strip { grid-template-columns: 1fr; } }

.kpi-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem 1.125rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.kpi-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
.kpi-icon--blue  { color: #2563eb; }
.kpi-icon--green { color: #16a34a; }
.kpi-icon--red   { color: #dc2626; }

.kpi-data {
  display: flex;
  flex-direction: column;
}

.kpi-val {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.kpi-lbl {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  margin-top: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ─── Toolbar ──────────────────────────────────────── */
.go-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.search-wrap {
  position: relative;
  flex: 1;
  max-width: 28rem;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.5625rem 0.875rem 0.5625rem 2.25rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.search-input::placeholder { color: #94a3b8; }

/* ─── Table Card ───────────────────────────────────── */
.table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

/* Loading Skeletons */
.table-loading {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.skel {
  height: 1rem;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
}

.skel--code  { width: 10rem; }
.skel--mid   { width: 8rem; }
.skel--short { width: 5rem; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty state */
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3.5rem 2rem;
  text-align: center;
}

.empty-icon { color: #cbd5e1; margin-bottom: 0.25rem; }
.empty-title { font-size: 1rem; font-weight: 700; color: #334155; }
.empty-sub { font-size: 0.875rem; color: #94a3b8; max-width: 28rem; line-height: 1.5; }

/* Table */
.table-outer {
  overflow-x: auto;
}

.go-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.go-table thead tr {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.go-table th {
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.go-row {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.12s;
}
.go-row:hover { background: #f8fafc; }
.go-row:last-child { border-bottom: none; }

.go-table td {
  padding: 0.875rem 1rem;
  color: #0f172a;
  vertical-align: middle;
}

.text-center { text-align: center !important; }

.barcode-cell {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #0f172a;
  background: #f1f5f9;
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  white-space: nowrap;
}

.id-cell {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #64748b;
}

.date-cell {
  font-size: 0.8125rem;
  color: #64748b;
  white-space: nowrap;
}

/* ─── Badges ───────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 0.2rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--green  { background: #dcfce7; color: #15803d; }
.badge--red    { background: #fee2e2; color: #b91c1c; }
.badge--amber  { background: #fef3c7; color: #b45309; }
.badge--orange { background: #ffedd5; color: #c2410c; }
.badge--blue   { background: #dbeafe; color: #1d4ed8; }
.badge--indigo { background: #e0e7ff; color: #4338ca; }
.badge--violet { background: #ede9fe; color: #6d28d9; }
.badge--slate  { background: #f1f5f9; color: #475569; }

/* Liberado dot indicator */
.liberado-dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}
.liberado-dot--yes { background: #16a34a; box-shadow: 0 0 0 2px #dcfce7; }
.liberado-dot--no  { background: #cbd5e1; }

/* Table footer */
.table-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid #f1f5f9;
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
  text-align: right;
}

/* ─── Modal ────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  width: 100%;
  max-width: 30rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Variante do modal de manutencao: glassmorphism escuro + largura expandida */
.modal-panel--manutencao {
  max-width: 48rem;
  background: rgba(9, 9, 11, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
}

/* ─── Overrides do modal de manutencao (tema escuro) ─── */
.modal-panel--manutencao .modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
  background: transparent;
}
.modal-panel--manutencao .modal-title {
  color: #f4f4f5;
}
.modal-panel--manutencao .modal-description {
  color: #a1a1aa;
}
.modal-panel--manutencao .modal-icon-wrap {
  background: linear-gradient(135deg, #064e3b, #065f46);
}
.modal-panel--manutencao .modal-close {
  border-color: rgba(255, 255, 255, 0.12);
  color: #71717a;
}
.modal-panel--manutencao .modal-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f4f4f5;
}
.modal-panel--manutencao .modal-footer {
  border-top-color: rgba(255, 255, 255, 0.06);
  background: transparent;
}
.modal-panel--manutencao .form-label {
  color: #d4d4d8;
}
.modal-panel--manutencao .form-input {
  background: rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
  color: #f4f4f5;
  color-scheme: dark;
}
.modal-panel--manutencao .form-input:focus {
  border-color: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

.modal-close {
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.modal-close:hover { background: #f1f5f9; color: #0f172a; }
.modal-close:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  overflow-y: auto;
}

.modal-description {
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
}

/* ─── Form Fields ──────────────────────────────────── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.required-star { color: #dc2626; }
.optional-tag {
  font-size: 0.7rem;
  font-weight: 500;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 0.05rem 0.4rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.select-wrap {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 0.5625rem 2.25rem 0.5625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.form-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.form-select--error { border-color: #dc2626; }
.form-select--error:focus { box-shadow: 0 0 0 3px rgba(220,38,38,0.12); }

.select-chevron {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #dc2626;
}

.form-textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  resize: vertical;
  min-height: 5rem;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  line-height: 1.5;
}
.form-textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.form-textarea::placeholder { color: #94a3b8; }

.info-tip {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  color: #1d4ed8;
  line-height: 1.5;
}

.tip-icon { flex-shrink: 0; margin-top: 0.05rem; }

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 1.125rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}

/* ─── Toast ────────────────────────────────────────── */
.toast-stack {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 99999;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.125rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  max-width: 22rem;
  pointer-events: auto;
}

.toast--success { background: #0f172a; color: #dcfce7; }
.toast--error   { background: #7f1d1d; color: #fee2e2; }

.toast-icon { flex-shrink: 0; }
.toast-msg  { line-height: 1.4; }

/* ─── Animations ───────────────────────────────────── */
.spin-anim {
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal transitions */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-panel, .modal-leave-active .modal-panel {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease;
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel {
  transform: translateY(1.5rem) scale(0.97);
  opacity: 0;
}

/* Toast transitions */
.toast-enter-active  { transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.toast-leave-active  { transition: all 0.25s ease; }
.toast-enter-from    { opacity: 0; transform: translateX(1.5rem); }
.toast-leave-to      { opacity: 0; transform: translateX(1.5rem); }

/* ─── Botão de ação — Timeline ─────────────────────────────── */
.btn-action-timeline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.btn-action-timeline:hover { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.btn-action-timeline:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

/* ═══════════════════════════════════════════════════════════════
   DRAWER — TIMELINE DE RASTREAMENTO (PAINEL E)
   Light Mode Industrial, slide da direita
═══════════════════════════════════════════════════════════════ */
.tl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  z-index: 9998;
  display: flex;
  justify-content: flex-end;
}
.tl-drawer {
  width: 100%;
  max-width: 26rem;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}
.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.125rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: #ffffff;
}
.tl-header-left { display: flex; align-items: center; gap: 0.75rem; }
.tl-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
}
.tl-title { font-size: 0.9375rem; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; }
.tl-subtitle { font-size: 0.75rem; color: #64748b; margin: 0.15rem 0 0; }
.tl-code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  background: #f1f5f9;
  padding: 0.1rem 0.375rem;
  border-radius: 0.2rem;
  color: #1d4ed8;
}
.tl-close {
  width: 2rem; height: 2rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.tl-close:hover { background: #f1f5f9; color: #0f172a; }
.tl-close:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

.tl-body { flex: 1; overflow-y: auto; padding: 1.25rem; background: #f8fafc; }

/* Loading skeleton */
.tl-loading { display: flex; flex-direction: column; gap: 1.25rem; }
.tl-skel-row { display: flex; gap: 1rem; align-items: flex-start; }
.tl-skel-dot {
  width: 0.875rem; height: 0.875rem;
  border-radius: 50%;
  background: #e2e8f0;
  flex-shrink: 0;
  margin-top: 0.25rem;
  animation: shimmer 1.4s infinite;
}
.tl-skel-content { flex: 1; display: flex; flex-direction: column; gap: 0.375rem; }
.tl-skel {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
  height: 0.875rem;
}
.tl-skel--title { width: 60%; height: 1rem; }
.tl-skel--sub   { width: 85%; height: 0.75rem; }

/* Empty */
.tl-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 3rem 1.5rem; gap: 0.5rem; }
.tl-empty-icon  { color: #cbd5e1; margin-bottom: 0.25rem; }
.tl-empty-title { font-size: 0.9375rem; font-weight: 700; color: #334155; }
.tl-empty-sub   { font-size: 0.8125rem; color: #94a3b8; line-height: 1.5; max-width: 18rem; }

/* Timeline list */
.tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 0.875rem; position: relative; align-items: flex-start; }

/* Conector e dot */
.tl-connector {
  position: absolute;
  left: 0.375rem;
  top: 1.125rem;
  width: 2px;
  bottom: 0;
  background: #e2e8f0;
  transform: translateX(-50%);
  z-index: 0;
}
.tl-connector--hidden { background: transparent; }

.tl-dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 0 0 1.5px currentColor;
  flex-shrink: 0;
  margin-top: 0.3125rem;
  z-index: 1;
  position: relative;
}
.rdot--green  { background: #16a34a; color: #16a34a; }
.rdot--amber  { background: #d97706; color: #d97706; }
.rdot--red    { background: #dc2626; color: #dc2626; }
.rdot--orange { background: #ea580c; color: #ea580c; }
.rdot--slate  { background: #64748b; color: #64748b; }

/* Card */
.tl-card {
  flex: 1;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
  margin-bottom: 1.125rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tl-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.tl-setor-wrap { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.tl-setor-icon { color: #64748b; flex-shrink: 0; }
.tl-setor-nome { font-size: 0.875rem; font-weight: 800; color: #0f172a; }
.tl-tipo-setor {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 0.05rem 0.375rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tl-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; }
.rstat--green  { background: #dcfce7; color: #15803d; }
.rstat--amber  { background: #fef3c7; color: #92400e; }
.rstat--red    { background: #fee2e2; color: #b91c1c; }
.rstat--orange { background: #ffedd5; color: #c2410c; }
.rstat--slate  { background: #f1f5f9; color: #475569; }

.tl-lote-tag { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: #64748b; }

.tl-dates {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
}
.tl-date-row { display: flex; align-items: center; gap: 0.375rem; }
.tl-date-icon  { color: #94a3b8; flex-shrink: 0; }
.tl-date-label { font-size: 0.75rem; font-weight: 600; color: #64748b; min-width: 4rem; }
.tl-date-val   { font-size: 0.8125rem; color: #0f172a; font-weight: 500; }

.tl-permanencia { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; }
.tl-perm-icon  { color: #64748b; flex-shrink: 0; }
.tl-perm-label { font-weight: 600; color: #64748b; }
.tl-perm-val   { font-weight: 800; color: #1d4ed8; }

.tl-maquina-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #4338ca;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
}
.tl-maquina-icon { color: #6366f1; flex-shrink: 0; }
.tl-maquina-label { font-weight: 600; color: #3730a3; }
.tl-maquina-val { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #312e81; }

.tl-operadores { display: flex; flex-direction: column; gap: 0.375rem; border-top: 1px solid #f1f5f9; padding-top: 0.5rem; background: #f8fafc; border-radius: 0.375rem; padding: 0.5rem 0.625rem; }
.tl-op-header { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: #334155; }
.tl-op-icon { color: #64748b; flex-shrink: 0; }
.tl-op-title { font-weight: 700; color: #1e293b; }
.tl-op-list { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #475569; flex-wrap: wrap; }
.tl-op-tag { font-weight: 700; color: #334155; }
.tl-op-sep { color: #cbd5e1; }
.tl-op { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; }
.tl-op-nome { color: #334155; font-weight: 500; }

.tl-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
  background: #ffffff;
}
.tl-footer-info { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: #94a3b8; font-weight: 500; }

/* Drawer slide-in */
.drawer-enter-active { transition: opacity 0.2s ease; }
.drawer-leave-active { transition: opacity 0.25s ease; }
.drawer-enter-active .tl-drawer { transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.drawer-leave-active .tl-drawer { transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.drawer-enter-from            { opacity: 0; }
.drawer-enter-from .tl-drawer { transform: translateX(100%); }
.drawer-leave-to              { opacity: 0; }
.drawer-leave-to .tl-drawer   { transform: translateX(100%); }

/* ─── Botão de Impressão e Layouts Extras ─────────────────── */
.actions-flex {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-action-print {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-family: inherit;
  font-weight: 700;
  color: #475569;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-action-print:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #0f172a;
}

.model-info-cell {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  text-align: left;
}
.model-name-text {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #0f172a;
}
.model-ref-sub {
  font-size: 0.6875rem;
  color: #64748b;
  font-weight: 500;
}
</style>
