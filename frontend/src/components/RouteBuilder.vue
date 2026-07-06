<script setup lang="ts">
import { ref, computed } from 'vue'
import draggable from 'vuedraggable'
import {
  Lock,
  GripVertical,
  FlaskConical,
  Scissors,
  Layers,
  Wrench,
  Shirt,
  Package,
  Zap,
  Flame,
  PrinterCheck,
  CheckCheck,
  Settings2,
  Save,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  ListOrdered,
  Box,
  Trash2,
  AlertTriangle,
  RotateCcw
} from '@lucide/vue'

// ─── Types ──────────────────────────────────────────────────────────────
interface RouteBlock {
  id: string
  label: string
  tipo: 'fixo' | 'flutuante' | 'condicional'
  icon: any
  color: string
  description: string
}

// ─── Fixed blocks (non-draggable, always present) ───────────────────────
const fixedStart: RouteBlock = {
  id: 'conferencia-inicial',
  label: 'Conferência Inicial',
  tipo: 'fixo',
  icon: CheckCheck,
  color: '#1e40af',
  description: 'Almoxarifado · Navalha · Telas',
}

const fixedMiddle: RouteBlock[] = [
  { id: 'corte-automatico', label: 'Corte Automático', tipo: 'fixo', icon: Scissors, color: '#0f172a', description: 'Máquinas de corte + Revisão' },
  { id: 'apoio',            label: 'Apoio',            tipo: 'fixo', icon: Wrench,   color: '#0f172a', description: 'Etapas de suporte ao corte' },
  { id: 'costura',          label: 'Costura',          tipo: 'fixo', icon: Shirt,    color: '#0f172a', description: 'Costura Principal' },
  { id: 'montagem',         label: 'Montagem',         tipo: 'fixo', icon: Layers,   color: '#0f172a', description: 'Montagem Final do Produto' },
]

const fixedEnd: RouteBlock = {
  id: 'laboratorio',
  label: 'Laboratório',
  tipo: 'fixo',
  icon: FlaskConical,
  color: '#166534',
  description: 'Inspeção Final + Veredito',
}

// ─── Area 1: Available Sectors (Estoque) ────────────────────────────────
const floatingAvailable = ref<RouteBlock[]>([
  { id: 'costura-programada', label: 'Costura Programada', tipo: 'flutuante', icon: PrinterCheck, color: '#7c3aed', description: 'Pode ser paralela ao Apoio ou adjacente à Costura' },
  { id: 'bordado',            label: 'Bordado',            tipo: 'flutuante', icon: Zap,          color: '#b45309', description: 'Posicione entre Apoio e Montagem' },
  { id: 'pre-fabricado',      label: 'Pré-Fabricado',      tipo: 'flutuante', icon: Package,      color: '#0369a1', description: 'Antes, junto ou depois de Montagem' },
])

// ─── Area 2: Múltiplas Dropzones Intercaladas e Paralelas ────────────────
const zoneAntesApoio = ref<RouteBlock[]>([])
const zoneJuntoApoio = ref<RouteBlock[]>([])
const zoneEntreApoioCostura = ref<RouteBlock[]>([])
const zoneJuntoCostura = ref<RouteBlock[]>([])
const zoneEntreCosturaMontagem = ref<RouteBlock[]>([])
const zoneJuntoMontagem = ref<RouteBlock[]>([])
const zonePosMontagem = ref<RouteBlock[]>([])

// ─── Conditional toggles ─────────────────────────────────────────────────
const toggleSerigrafia   = ref(false)
const toggleVulcanizado  = ref(false)
const toggleCaixaTeste   = ref(false)
const tamanhoCaixaTeste  = ref('')

// ─── Drag state ──────────────────────────────────────────────────────────
const isDragging = ref(false)

// ─── Notification state ──────────────────────────────────────────────────
const toastMsg = ref('')
const toastType = ref<'success' | 'error'>('success')
const showToastBanner = ref(false)
let toastTimeout: any = null

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  if (toastTimeout) clearTimeout(toastTimeout)
  toastMsg.value = msg
  toastType.value = type
  showToastBanner.value = true
  toastTimeout = setTimeout(() => {
    showToastBanner.value = false
  }, 5000)
}

// ─── Validação de Regras de Negócio ──────────────────────────────────────
function validarPosicionamento(itemId: string, zonaId: string): { valido: boolean; mensagem?: string } {
  if (zonaId === 'zoneAntesApoio') {
    return {
      valido: false,
      mensagem: 'Nenhum dos setores flutuantes pode ser posicionado antes do Apoio.'
    }
  }

  if (itemId === 'costura-programada') {
    const zonasValidas = ['zoneJuntoApoio', 'zoneEntreApoioCostura', 'zoneJuntoCostura']
    if (!zonasValidas.includes(zonaId)) {
      return {
        valido: false,
        mensagem: 'O setor Costura Programada só pode ser inserido no Apoio (paralelo), junto da Costura (paralelo) ou de forma isolada após o Apoio.'
      }
    }
  }

  if (itemId === 'bordado') {
    const zonasValidas = ['zoneEntreApoioCostura', 'zoneEntreCosturaMontagem']
    if (!zonasValidas.includes(zonaId)) {
      return {
        valido: false,
        mensagem: 'O setor Bordado só pode ser posicionado no intervalo entre o Apoio e a Montagem.'
      }
    }
  }

  if (itemId === 'pre-fabricado') {
    const zonasValidas = ['zoneEntreCosturaMontagem', 'zoneJuntoMontagem', 'zonePosMontagem']
    if (!zonasValidas.includes(zonaId)) {
      return {
        valido: false,
        mensagem: 'O setor Pré-Fabricado só pode ser inserido antes, junto (paralelo) ou após a Montagem.'
      }
    }
  }

  return { valido: true }
}

// ─── Get reference to a zone by id ───────────────────────────────────────
function getZonaArray(zonaId: string) {
  if (zonaId === 'zoneAntesApoio') return zoneAntesApoio
  if (zonaId === 'zoneJuntoApoio') return zoneJuntoApoio
  if (zonaId === 'zoneEntreApoioCostura') return zoneEntreApoioCostura
  if (zonaId === 'zoneJuntoCostura') return zoneJuntoCostura
  if (zonaId === 'zoneEntreCosturaMontagem') return zoneEntreCosturaMontagem
  if (zonaId === 'zoneJuntoMontagem') return zoneJuntoMontagem
  if (zonaId === 'zonePosMontagem') return zonePosMontagem
  return null
}

// ─── Add handler with business rule checking ─────────────────────────────
function aoAdicionarItem(evt: any, zonaId: string) {
  const zonaArray = getZonaArray(zonaId)
  if (!zonaArray) return

  const item = zonaArray.value[evt.newIndex]
  if (!item) return

  const validacao = validarPosicionamento(item.id, zonaId)
  if (!validacao.valido) {
    // Remove do array da zona de destino
    zonaArray.value.splice(evt.newIndex, 1)

    // Adiciona de volta ao estoque se não estiver lá
    if (!floatingAvailable.value.some(x => x.id === item.id)) {
      floatingAvailable.value.push(item)
    }

    // Alerta o modelista
    showToast(validacao.mensagem || 'Operação não permitida.', 'error')
  }
}

// ─── Quick Removal Handler ───────────────────────────────────────────────
function removerSetor(block: RouteBlock) {
  zoneAntesApoio.value = zoneAntesApoio.value.filter(x => x.id !== block.id)
  zoneJuntoApoio.value = zoneJuntoApoio.value.filter(x => x.id !== block.id)
  zoneEntreApoioCostura.value = zoneEntreApoioCostura.value.filter(x => x.id !== block.id)
  zoneJuntoCostura.value = zoneJuntoCostura.value.filter(x => x.id !== block.id)
  zoneEntreCosturaMontagem.value = zoneEntreCosturaMontagem.value.filter(x => x.id !== block.id)
  zoneJuntoMontagem.value = zoneJuntoMontagem.value.filter(x => x.id !== block.id)
  zonePosMontagem.value = zonePosMontagem.value.filter(x => x.id !== block.id)

  if (!floatingAvailable.value.some(x => x.id === block.id)) {
    floatingAvailable.value.push(block)
  }
}

// ─── Reset route layout ──────────────────────────────────────────────────
function resetarRota() {
  zoneAntesApoio.value = []
  zoneJuntoApoio.value = []
  zoneEntreApoioCostura.value = []
  zoneJuntoCostura.value = []
  zoneEntreCosturaMontagem.value = []
  zoneJuntoMontagem.value = []
  zonePosMontagem.value = []

  floatingAvailable.value = [
    { id: 'costura-programada', label: 'Costura Programada', tipo: 'flutuante', icon: PrinterCheck, color: '#7c3aed', description: 'Pode ser paralela ao Apoio ou adjacente à Costura' },
    { id: 'bordado',            label: 'Bordado',            tipo: 'flutuante', icon: Zap,          color: '#b45309', description: 'Posicione entre Apoio e Montagem' },
    { id: 'pre-fabricado',      label: 'Pré-Fabricado',      tipo: 'flutuante', icon: Package,      color: '#0369a1', description: 'Antes, junto ou depois de Montagem' },
  ]
  showToast('Rota redefinida para o layout padrão.', 'success')
}

// ─── Computed full timeline preview ──────────────────────────────────────
const fullTimeline = computed<Array<RouteBlock & { isConditional?: boolean; isParallel?: boolean; tipoExecucao?: 'PARALELO' | 'SEQUENCIAL' }>>(() => {
  const result: Array<RouteBlock & { isConditional?: boolean; isParallel?: boolean; tipoExecucao?: 'PARALELO' | 'SEQUENCIAL' }> = []

  result.push({ ...fixedStart, tipoExecucao: 'SEQUENCIAL' })
  result.push({ ...fixedMiddle[0], tipoExecucao: 'SEQUENCIAL' })

  if (toggleSerigrafia.value) {
    result.push({
      id: 'serigrafia',
      label: 'Serigrafia',
      tipo: 'condicional',
      icon: Flame,
      color: '#dc2626',
      description: 'Ativado via toggle — após Corte',
      isConditional: true,
      tipoExecucao: 'SEQUENCIAL'
    })
  }

  for (const block of zoneAntesApoio.value) {
    result.push({ ...block, tipoExecucao: 'SEQUENCIAL' })
  }

  result.push({ ...fixedMiddle[1], tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoApoio.value) {
    result.push({ ...block, isParallel: true, tipoExecucao: 'PARALELO' })
  }

  for (const block of zoneEntreApoioCostura.value) {
    result.push({ ...block, tipoExecucao: 'SEQUENCIAL' })
  }

  result.push({ ...fixedMiddle[2], tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoCostura.value) {
    result.push({ ...block, isParallel: true, tipoExecucao: 'PARALELO' })
  }

  for (const block of zoneEntreCosturaMontagem.value) {
    result.push({ ...block, tipoExecucao: 'SEQUENCIAL' })
  }

  result.push({ ...fixedMiddle[3], tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoMontagem.value) {
    result.push({ ...block, isParallel: true, tipoExecucao: 'PARALELO' })
  }

  if (toggleVulcanizado.value) {
    result.push({
      id: 'vulcanizado',
      label: 'Vulcanizado',
      tipo: 'condicional',
      icon: Flame,
      color: '#ea580c',
      description: 'Paralelo com Montagem',
      isConditional: true,
      isParallel: true,
      tipoExecucao: 'PARALELO'
    })
  }

  for (const block of zonePosMontagem.value) {
    result.push({ ...block, tipoExecucao: 'SEQUENCIAL' })
  }

  result.push({ ...fixedEnd, tipoExecucao: 'SEQUENCIAL' })

  return result
})

// ─── Save handler ────────────────────────────────────────────────────────
const saveSuccess = ref(false)

function salvarRota() {
  const rotaSalvar: any[] = []
  let currentOrdem = 1

  // 1. Conferência Inicial
  rotaSalvar.push({ ordem: currentOrdem, setorId: fixedStart.id, label: fixedStart.label, tipo: fixedStart.tipo, tipoExecucao: 'SEQUENCIAL' })
  currentOrdem++

  // 2. Corte Automático
  rotaSalvar.push({ ordem: currentOrdem, setorId: fixedMiddle[0].id, label: fixedMiddle[0].label, tipo: fixedMiddle[0].tipo, tipoExecucao: 'SEQUENCIAL' })
  currentOrdem++

  // 3. Serigrafia
  if (toggleSerigrafia.value) {
    rotaSalvar.push({ ordem: currentOrdem, setorId: 'serigrafia', label: 'Serigrafia', tipo: 'condicional', tipoExecucao: 'SEQUENCIAL' })
    currentOrdem++
  }

  // 4. Antes do Apoio
  for (const block of zoneAntesApoio.value) {
    rotaSalvar.push({ ordem: currentOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'SEQUENCIAL' })
    currentOrdem++
  }

  // 5. Apoio
  const apoioOrdem = currentOrdem
  rotaSalvar.push({ ordem: apoioOrdem, setorId: fixedMiddle[1].id, label: fixedMiddle[1].label, tipo: fixedMiddle[1].tipo, tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoApoio.value) {
    rotaSalvar.push({ ordem: apoioOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'PARALELO' })
  }
  currentOrdem++

  // 6. Entre Apoio e Costura
  for (const block of zoneEntreApoioCostura.value) {
    rotaSalvar.push({ ordem: currentOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'SEQUENCIAL' })
    currentOrdem++
  }

  // 7. Costura
  const costuraOrdem = currentOrdem
  rotaSalvar.push({ ordem: costuraOrdem, setorId: fixedMiddle[2].id, label: fixedMiddle[2].label, tipo: fixedMiddle[2].tipo, tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoCostura.value) {
    rotaSalvar.push({ ordem: costuraOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'PARALELO' })
  }
  currentOrdem++

  // 8. Entre Costura e Montagem
  for (const block of zoneEntreCosturaMontagem.value) {
    rotaSalvar.push({ ordem: currentOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'SEQUENCIAL' })
    currentOrdem++
  }

  // 9. Montagem
  const montagemOrdem = currentOrdem
  rotaSalvar.push({ ordem: montagemOrdem, setorId: fixedMiddle[3].id, label: fixedMiddle[3].label, tipo: fixedMiddle[3].tipo, tipoExecucao: 'SEQUENCIAL' })
  for (const block of zoneJuntoMontagem.value) {
    rotaSalvar.push({ ordem: montagemOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'PARALELO' })
  }
  if (toggleVulcanizado.value) {
    rotaSalvar.push({ ordem: montagemOrdem, setorId: 'vulcanizado', label: 'Vulcanizado', tipo: 'condicional', tipoExecucao: 'PARALELO' })
  }
  currentOrdem++

  // 10. Após a Montagem
  for (const block of zonePosMontagem.value) {
    rotaSalvar.push({ ordem: currentOrdem, setorId: block.id, label: block.label, tipo: block.tipo, tipoExecucao: 'SEQUENCIAL' })
    currentOrdem++
  }

  // 11. Laboratório
  rotaSalvar.push({ ordem: currentOrdem, setorId: fixedEnd.id, label: fixedEnd.label, tipo: fixedEnd.tipo, tipoExecucao: 'SEQUENCIAL' })

  const payload = {
    rota: rotaSalvar,
    configuracoes: {
      serigrafia: toggleSerigrafia.value,
      vulcanizado: toggleVulcanizado.value,
      possuiCaixaTeste: toggleCaixaTeste.value,
      tamanhoCaixaTeste: toggleCaixaTeste.value ? tamanhoCaixaTeste.value : null,
    },
  }
  console.log('[RouteBuilder] Rota a salvar (Dropzones Múltiplas):', JSON.stringify(payload, null, 2))
  saveSuccess.value = true
  setTimeout(() => { saveSuccess.value = false }, 3000)
}

function getBlockBg(block: RouteBlock) {
  if (block.tipo === 'fixo') return '#ffffff'
  if (block.tipo === 'flutuante') return '#faf5ff'
  return '#fff7ed'
}

function getBlockBorder(block: RouteBlock) {
  if (block.tipo === 'fixo') return '#e2e8f0'
  if (block.tipo === 'flutuante') return '#ddd6fe'
  return '#fed7aa'
}
</script>

<template>
  <div class="rb-root">
    <!-- ══ TOAST NOTIFICATION ═══════════════════════════════════════════ -->
    <Transition name="toast-slide">
      <div v-if="showToastBanner" class="rb-toast" :class="`rb-toast--${toastType}`" role="alert">
        <AlertTriangle v-if="toastType === 'error'" :size="18" class="toast-icon" aria-hidden="true" />
        <CheckCheck v-else :size="18" class="toast-icon" aria-hidden="true" />
        <span class="toast-text">{{ toastMsg }}</span>
      </div>
    </Transition>

    <!-- ══ PAGE HEADER ══════════════════════════════════════════════════ -->
    <header class="rb-header">
      <div class="rb-header-left">
        <div class="rb-header-icon" aria-hidden="true">
          <ListOrdered :size="20" />
        </div>
        <div>
          <h1 class="rb-title">Construtor de Rota de Modelo</h1>
          <p class="rb-subtitle">Defina a sequência produtiva arrastando os setores flutuantes e ativando os condicionais.</p>
        </div>
      </div>
      <div class="rb-header-actions">
        <button class="btn-reset" @click="resetarRota" type="button" title="Redefinir Rota">
          <RotateCcw :size="16" aria-hidden="true" />
          <span>Redefinir</span>
        </button>
        <button
          class="btn-save"
          :class="{ 'btn-save--success': saveSuccess }"
          @click="salvarRota"
          type="button"
        >
          <Save :size="16" aria-hidden="true" />
          <span>{{ saveSuccess ? 'Rota Salva!' : 'Salvar Rota' }}</span>
        </button>
      </div>
    </header>

    <!-- ══ MAIN LAYOUT: left panel + right timeline ═════════════════════ -->
    <div class="rb-layout">

      <!-- ── LEFT PANEL: available sectors palette + toggles ────────── -->
      <aside class="rb-sidebar">

        <!-- Area 1: Available Sectors (Estoque) -->
        <section class="sidebar-section">
          <h2 class="sidebar-section-title">
            <GripVertical :size="14" aria-hidden="true" />
            Setores Disponíveis
          </h2>
          <p class="sidebar-hint">Arraste os blocos abaixo para qualquer uma das dropzones destacadas na Linha do Tempo.</p>

          <draggable
            :list="floatingAvailable"
            group="sectors"
            item-key="id"
            handle=".drag-handle"
            ghost-class="drag-ghost"
            drag-class="drag-active"
            @start="isDragging = true"
            @end="isDragging = false"
            class="palette-list"
            :class="{ 'palette-list--empty': floatingAvailable.length === 0 }"
          >
            <template #item="{ element }">
              <div class="palette-block" :style="{ borderColor: getBlockBorder(element), background: getBlockBg(element) }">
                <span class="drag-handle" title="Arraste para a rota">
                  <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                </span>
                <component :is="element.icon" :size="18" class="block-icon" :style="{ color: element.color }" aria-hidden="true" />
                <div class="block-meta">
                  <span class="block-label">{{ element.label }}</span>
                  <span class="block-desc">{{ element.description }}</span>
                </div>
              </div>
            </template>
            <template #footer>
              <div v-if="floatingAvailable.length === 0" class="palette-empty-msg">
                <span>Nenhum setor disponível no estoque</span>
              </div>
            </template>
          </draggable>
        </section>

        <!-- Conditionals Toggles -->
        <section class="sidebar-section">
          <h2 class="sidebar-section-title">
            <Settings2 :size="14" aria-hidden="true" />
            Setores Condicionais
          </h2>

          <div class="toggle-card">
            <div class="toggle-info">
              <Flame :size="16" style="color:#dc2626" aria-hidden="true" />
              <div>
                <span class="toggle-label">Serigrafia</span>
                <span class="toggle-desc">Após Corte Automático</span>
              </div>
            </div>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--on': toggleSerigrafia }"
              @click="toggleSerigrafia = !toggleSerigrafia"
              type="button"
              :aria-pressed="toggleSerigrafia"
              aria-label="Ativar Serigrafia"
            >
              <ToggleRight v-if="toggleSerigrafia" :size="32" class="t-icon-on" />
              <ToggleLeft  v-else                  :size="32" class="t-icon-off" />
            </button>
          </div>

          <div class="toggle-card">
            <div class="toggle-info">
              <Flame :size="16" style="color:#ea580c" aria-hidden="true" />
              <div>
                <span class="toggle-label">Vulcanizado</span>
                <span class="toggle-desc">Paralelo com Montagem</span>
              </div>
            </div>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--on': toggleVulcanizado }"
              @click="toggleVulcanizado = !toggleVulcanizado"
              type="button"
              :aria-pressed="toggleVulcanizado"
              aria-label="Ativar Vulcanizado"
            >
              <ToggleRight v-if="toggleVulcanizado" :size="32" class="t-icon-on" />
              <ToggleLeft  v-else                   :size="32" class="t-icon-off" />
            </button>
          </div>
        </section>

        <!-- Caixa Teste -->
        <section class="sidebar-section">
          <h2 class="sidebar-section-title">
            <Box :size="14" aria-hidden="true" />
            Configuração de Caixa Teste
          </h2>

          <div class="toggle-card">
            <div class="toggle-info">
              <Box :size="16" style="color:#0369a1" aria-hidden="true" />
              <div>
                <span class="toggle-label">Possui Caixa Teste?</span>
                <span class="toggle-desc">Ativa o lote paralelo de caixa</span>
              </div>
            </div>
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--on': toggleCaixaTeste }"
              @click="toggleCaixaTeste = !toggleCaixaTeste"
              type="button"
              :aria-pressed="toggleCaixaTeste"
              aria-label="Ativar Caixa Teste"
            >
              <ToggleRight v-if="toggleCaixaTeste" :size="32" class="t-icon-on" />
              <ToggleLeft  v-else                  :size="32" class="t-icon-off" />
            </button>
          </div>

          <Transition name="field-reveal">
            <div v-if="toggleCaixaTeste" class="caixa-field-wrapper">
              <label for="tamanho-caixa" class="field-label">Tamanho da Caixa Teste</label>
              <input
                id="tamanho-caixa"
                v-model="tamanhoCaixaTeste"
                type="text"
                class="field-input"
                placeholder="Ex: 38, 39, 40-42..."
              />
            </div>
          </Transition>
        </section>
      </aside>

      <!-- ── RIGHT: TIMELINE (Area 2: Rota) ────────────────────────────── -->
      <div class="rb-timeline-area">
        <div class="timeline-header">
          <span class="timeline-label-text">
            <ListOrdered :size="14" aria-hidden="true" />
            Preview da Rota em Tempo Real
          </span>
          <span class="timeline-count">{{ fullTimeline.length }} etapas</span>
        </div>

        <div class="timeline-track">
          <!-- 1. Conferência Inicial -->
          <div class="tl-item">
            <div class="tl-block tl-block--fixo" aria-label="Etapa fixa: Conferência Inicial">
              <div class="tl-block-left">
                <div class="tl-block-icon" style="background:#eff6ff; color:#1e40af">
                  <component :is="fixedStart.icon" :size="18" aria-hidden="true" />
                </div>
                <div class="tl-block-text">
                  <span class="tl-block-name">{{ fixedStart.label }}</span>
                  <span class="tl-block-sub">{{ fixedStart.description }}</span>
                </div>
              </div>
              <div class="tl-block-right">
                <span class="badge badge--fixo">
                  <Lock :size="10" aria-hidden="true" />
                  Fixo
                </span>
              </div>
            </div>
            <div class="tl-connector"></div>
          </div>

          <!-- 2. Corte Automático -->
          <div class="tl-item">
            <div class="tl-block tl-block--fixo">
              <div class="tl-block-left">
                <div class="tl-block-icon" style="background:#f8fafc; color:#0f172a">
                  <Scissors :size="18" aria-hidden="true" />
                </div>
                <div class="tl-block-text">
                  <span class="tl-block-name">Corte Automático</span>
                  <span class="tl-block-sub">Máquinas de corte + Revisão</span>
                </div>
              </div>
              <div class="tl-block-right">
                <span class="badge badge--fixo">
                  <Lock :size="10" aria-hidden="true" />
                  Fixo
                </span>
              </div>
            </div>
            <div class="tl-connector"></div>
          </div>

          <!-- Serigrafia (Conditional) -->
          <Transition name="block-pop">
            <div v-if="toggleSerigrafia" class="tl-item">
              <div class="tl-block tl-block--condicional" aria-label="Serigrafia – setor condicional">
                <div class="tl-block-left">
                  <div class="tl-block-icon" style="background:#fff7ed; color:#dc2626">
                    <Flame :size="18" aria-hidden="true" />
                  </div>
                  <div class="tl-block-text">
                    <span class="tl-block-name">Serigrafia</span>
                    <span class="tl-block-sub">Após Corte Automático</span>
                  </div>
                </div>
                <div class="tl-block-right">
                  <span class="badge badge--condicional">Condicional</span>
                </div>
              </div>
              <div class="tl-connector"></div>
            </div>
          </Transition>

          <!-- DROPZONE 1: Antes do Apoio -->
          <div class="tl-dropzone-container">
            <draggable
              :list="zoneAntesApoio"
              group="sectors"
              item-key="id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              drag-class="drag-active"
              @start="isDragging = true"
              @end="isDragging = false"
              @add="aoAdicionarItem($event, 'zoneAntesApoio')"
              class="intercalated-drop-area"
              :class="{ 
                'intercalated-drop-area--empty': zoneAntesApoio.length === 0,
                'intercalated-drop-area--visible': isDragging && zoneAntesApoio.length === 0
              }"
            >
              <template #item="{ element }">
                <div class="tl-intercalated-item">
                  <div class="tl-block tl-block--flutuante" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--flutuante">Flutuante</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div class="tl-connector"></div>
                </div>
              </template>
              <template #footer>
                <div v-if="zoneAntesApoio.length === 0 && isDragging" class="intercalated-placeholder">
                  <span>Solte antes do Apoio</span>
                </div>
              </template>
            </draggable>
          </div>

          <!-- 3. Apoio & DROPZONE 2: Junto ao Apoio (Paralelo) -->
          <div class="tl-item">
            <div class="tl-parallel-wrapper" :class="{ 'tl-parallel-wrapper--active': zoneJuntoApoio.length > 0 }">
              <div class="tl-block tl-block--fixo" style="flex: 1">
                <div class="tl-block-left">
                  <div class="tl-block-icon" style="background:#f8fafc; color:#0f172a">
                    <Wrench :size="18" aria-hidden="true" />
                  </div>
                  <div class="tl-block-text">
                    <span class="tl-block-name">Apoio</span>
                    <span class="tl-block-sub">Etapas de suporte ao corte</span>
                  </div>
                </div>
                <div class="tl-block-right">
                  <span class="badge badge--fixo">
                    <Lock :size="10" aria-hidden="true" />
                    Fixo
                  </span>
                </div>
              </div>

              <!-- Parallel Dropzone: Junto ao Apoio -->
              <draggable
                :list="zoneJuntoApoio"
                group="sectors"
                item-key="id"
                handle=".drag-handle"
                ghost-class="drag-ghost"
                drag-class="drag-active"
                @start="isDragging = true"
                @end="isDragging = false"
                @add="aoAdicionarItem($event, 'zoneJuntoApoio')"
                class="parallel-drop-area"
                :class="{ 
                  'parallel-drop-area--active': zoneJuntoApoio.length > 0,
                  'parallel-drop-area--visible': isDragging && zoneJuntoApoio.length === 0
                }"
              >
                <template #item="{ element }">
                  <div class="tl-block tl-block--flutuante tl-block--parallel" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--parallel">Paralelo</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
            <div class="tl-connector"></div>
          </div>

          <!-- DROPZONE 3: Entre Apoio e Costura -->
          <div class="tl-dropzone-container">
            <draggable
              :list="zoneEntreApoioCostura"
              group="sectors"
              item-key="id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              drag-class="drag-active"
              @start="isDragging = true"
              @end="isDragging = false"
              @add="aoAdicionarItem($event, 'zoneEntreApoioCostura')"
              class="intercalated-drop-area"
              :class="{ 
                'intercalated-drop-area--empty': zoneEntreApoioCostura.length === 0,
                'intercalated-drop-area--visible': isDragging && zoneEntreApoioCostura.length === 0
              }"
            >
              <template #item="{ element }">
                <div class="tl-intercalated-item">
                  <div class="tl-block tl-block--flutuante" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--flutuante">Flutuante</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div class="tl-connector"></div>
                </div>
              </template>
              <template #footer>
                <div v-if="zoneEntreApoioCostura.length === 0 && isDragging" class="intercalated-placeholder">
                  <span>Solte entre Apoio e Costura</span>
                </div>
              </template>
            </draggable>
          </div>

          <!-- 4. Costura & DROPZONE 4: Junto à Costura (Paralelo) -->
          <div class="tl-item">
            <div class="tl-parallel-wrapper" :class="{ 'tl-parallel-wrapper--active': zoneJuntoCostura.length > 0 }">
              <div class="tl-block tl-block--fixo" style="flex: 1">
                <div class="tl-block-left">
                  <div class="tl-block-icon" style="background:#f8fafc; color:#0f172a">
                    <Shirt :size="18" aria-hidden="true" />
                  </div>
                  <div class="tl-block-text">
                    <span class="tl-block-name">Costura</span>
                    <span class="tl-block-sub">Costura Principal</span>
                  </div>
                </div>
                <div class="tl-block-right">
                  <span class="badge badge--fixo">
                    <Lock :size="10" aria-hidden="true" />
                    Fixo
                  </span>
                </div>
              </div>

              <!-- Parallel Dropzone: Junto à Costura -->
              <draggable
                :list="zoneJuntoCostura"
                group="sectors"
                item-key="id"
                handle=".drag-handle"
                ghost-class="drag-ghost"
                drag-class="drag-active"
                @start="isDragging = true"
                @end="isDragging = false"
                @add="aoAdicionarItem($event, 'zoneJuntoCostura')"
                class="parallel-drop-area"
                :class="{ 
                  'parallel-drop-area--active': zoneJuntoCostura.length > 0,
                  'parallel-drop-area--visible': isDragging && zoneJuntoCostura.length === 0
                }"
              >
                <template #item="{ element }">
                  <div class="tl-block tl-block--flutuante tl-block--parallel" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--parallel">Paralelo</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
            <div class="tl-connector"></div>
          </div>

          <!-- DROPZONE 5: Entre Costura e Montagem -->
          <div class="tl-dropzone-container">
            <draggable
              :list="zoneEntreCosturaMontagem"
              group="sectors"
              item-key="id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              drag-class="drag-active"
              @start="isDragging = true"
              @end="isDragging = false"
              @add="aoAdicionarItem($event, 'zoneEntreCosturaMontagem')"
              class="intercalated-drop-area"
              :class="{ 
                'intercalated-drop-area--empty': zoneEntreCosturaMontagem.length === 0,
                'intercalated-drop-area--visible': isDragging && zoneEntreCosturaMontagem.length === 0
              }"
            >
              <template #item="{ element }">
                <div class="tl-intercalated-item">
                  <div class="tl-block tl-block--flutuante" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--flutuante">Flutuante</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div class="tl-connector"></div>
                </div>
              </template>
              <template #footer>
                <div v-if="zoneEntreCosturaMontagem.length === 0 && isDragging" class="intercalated-placeholder">
                  <span>Solte entre Costura e Montagem</span>
                </div>
              </template>
            </draggable>
          </div>

          <!-- 5. Montagem & DROPZONE 6: Junto à Montagem (Paralelo) + Vulcanizado (Paralelo Condicional) -->
          <div class="tl-item">
            <div class="tl-parallel-wrapper" :class="{ 'tl-parallel-wrapper--active': zoneJuntoMontagem.length > 0 || toggleVulcanizado }">
              <div class="tl-block tl-block--fixo" style="flex: 1">
                <div class="tl-block-left">
                  <div class="tl-block-icon" style="background:#f8fafc; color:#0f172a">
                    <Layers :size="18" aria-hidden="true" />
                  </div>
                  <div class="tl-block-text">
                    <span class="tl-block-name">Montagem</span>
                    <span class="tl-block-sub">Montagem Final do Produto</span>
                  </div>
                </div>
                <div class="tl-block-right">
                  <span class="badge badge--fixo">
                    <Lock :size="10" aria-hidden="true" />
                    Fixo
                  </span>
                </div>
              </div>

              <!-- Parallel Dropzone: Junto à Montagem -->
              <draggable
                :list="zoneJuntoMontagem"
                group="sectors"
                item-key="id"
                handle=".drag-handle"
                ghost-class="drag-ghost"
                drag-class="drag-active"
                @start="isDragging = true"
                @end="isDragging = false"
                @add="aoAdicionarItem($event, 'zoneJuntoMontagem')"
                class="parallel-drop-area"
                :class="{ 
                  'parallel-drop-area--active': zoneJuntoMontagem.length > 0,
                  'parallel-drop-area--visible': isDragging && zoneJuntoMontagem.length === 0
                }"
              >
                <template #item="{ element }">
                  <div class="tl-block tl-block--flutuante tl-block--parallel" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--parallel">Paralelo</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </template>
              </draggable>

              <!-- Vulcanizado Condicional Paralelo -->
              <Transition name="block-pop">
                <div v-if="toggleVulcanizado" class="tl-block tl-block--condicional tl-block--parallel" aria-label="Vulcanizado – paralelo com Montagem">
                  <div class="tl-block-left">
                    <div class="tl-block-icon" style="background:#fff7ed; color:#ea580c">
                      <Flame :size="18" aria-hidden="true" />
                    </div>
                    <div class="tl-block-text">
                      <span class="tl-block-name">Vulcanizado</span>
                      <span class="tl-block-sub">Paralelo com Montagem</span>
                    </div>
                  </div>
                  <div class="tl-block-right">
                    <span class="badge badge--parallel">Paralelo</span>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="tl-connector"></div>
          </div>

          <!-- DROPZONE 7: Após a Montagem -->
          <div class="tl-dropzone-container">
            <draggable
              :list="zonePosMontagem"
              group="sectors"
              item-key="id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              drag-class="drag-active"
              @start="isDragging = true"
              @end="isDragging = false"
              @add="aoAdicionarItem($event, 'zonePosMontagem')"
              class="intercalated-drop-area"
              :class="{ 
                'intercalated-drop-area--empty': zonePosMontagem.length === 0,
                'intercalated-drop-area--visible': isDragging && zonePosMontagem.length === 0
              }"
            >
              <template #item="{ element }">
                <div class="tl-intercalated-item">
                  <div class="tl-block tl-block--flutuante" :style="{ borderColor: getBlockBorder(element) }">
                    <span class="drag-handle tl-drag-handle" title="Arraste para reordenar ou remover">
                      <GripVertical :size="16" class="drag-handle-icon" aria-hidden="true" />
                    </span>
                    <div class="tl-block-left">
                      <div class="tl-block-icon" :style="{ background: getBlockBg(element), color: element.color }">
                        <component :is="element.icon" :size="18" aria-hidden="true" />
                      </div>
                      <div class="tl-block-text">
                        <span class="tl-block-name">{{ element.label }}</span>
                        <span class="tl-block-sub">{{ element.description }}</span>
                      </div>
                    </div>
                    <div class="tl-block-right flex-row-layout">
                      <span class="badge badge--flutuante">Flutuante</span>
                      <button class="btn-remove-sector" @click="removerSetor(element)" type="button" title="Remover">
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div class="tl-connector"></div>
                </div>
              </template>
              <template #footer>
                <div v-if="zonePosMontagem.length === 0 && isDragging" class="intercalated-placeholder">
                  <span>Solte após a Montagem</span>
                </div>
              </template>
            </draggable>
          </div>

          <!-- 6. Laboratório -->
          <div class="tl-item">
            <div class="tl-block tl-block--fixo tl-block--end" aria-label="Etapa fixa final: Laboratório">
              <div class="tl-block-left">
                <div class="tl-block-icon" style="background:#f0fdf4; color:#166534">
                  <FlaskConical :size="18" aria-hidden="true" />
                </div>
                <div class="tl-block-text">
                  <span class="tl-block-name">{{ fixedEnd.label }}</span>
                  <span class="tl-block-sub">{{ fixedEnd.description }}</span>
                </div>
              </div>
              <div class="tl-block-right">
                <span class="badge badge--fixo badge--end">
                  <Lock :size="10" aria-hidden="true" />
                  Fixo · Final
                </span>
              </div>
            </div>
          </div>

        </div><!-- /timeline-track -->

        <!-- ROUTE SUMMARY -->
        <div class="route-summary">
          <div class="summary-title">
            <ChevronRight :size="14" aria-hidden="true" />
            Resumo da Rota — {{ fullTimeline.length }} etapas definidas
          </div>
          <div class="summary-chips">
            <span v-for="(block, i) in fullTimeline" :key="block.id" class="summary-chip" :class="`summary-chip--${block.tipo}`">
              <span class="chip-num">{{ i + 1 }}</span>
              {{ block.label }}
              <span v-if="block.tipoExecucao === 'PARALELO'" class="chip-parallel-indicator">(Paralelo)</span>
            </span>
          </div>
        </div>

      </div><!-- /rb-timeline-area -->
    </div><!-- /rb-layout -->
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════
   ROOT & TOAST BANNER
═══════════════════════════════════════════════════════ */
.rb-root {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  position: relative;
}

.rb-toast {
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

.rb-toast--success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.rb-toast--error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.toast-icon {
  flex-shrink: 0;
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
   HEADER & ACTIONS
═══════════════════════════════════════════════════════ */
.rb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.rb-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.rb-header-icon {
  width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, #0f172a, #1e40af);
  color: #ffffff;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(30, 64, 175, 0.2);
}

.rb-title {
  font-size: 1.375rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0 0 0.125rem;
}

.rb-subtitle {
  font-size: 0.8125rem;
  color: #475569;
  margin: 0;
}

.rb-header-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.btn-reset {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  font-size: 0.8125rem;
  font-weight: 700;
  font-family: inherit;
  color: #475569;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reset:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #0f172a;
}

.btn-save {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  font-family: inherit;
  color: #ffffff;
  background: linear-gradient(135deg, #0f172a, #1e40af);
  border: none;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.15s;
  will-change: transform;
}

.btn-save:hover { opacity: 0.9; box-shadow: 0 6px 20px rgba(30, 64, 175, 0.3); transform: translateY(-1px); }
.btn-save:active { transform: scale(0.97); }
.btn-save:focus-visible { outline: 3px solid #1e40af; outline-offset: 2px; }
.btn-save--success { background: linear-gradient(135deg, #166534, #15803d) !important; }

/* ═══════════════════════════════════════════════════════
   MAIN LAYOUT
═══════════════════════════════════════════════════════ */
.rb-layout {
  display: grid;
  grid-template-columns: 20rem 1fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 1024px) {
  .rb-layout { grid-template-columns: 1fr; }
}

@media (min-width: 1920px) {
  .rb-layout { grid-template-columns: 24rem 1fr; gap: 2rem; }
  .rb-title { font-size: 1.75rem; }
}

@media (min-width: 2560px) {
  .rb-layout { grid-template-columns: 30rem 1fr; gap: 2.5rem; }
  .rb-title { font-size: 2.25rem; }
}

/* ═══════════════════════════════════════════════════════
   LEFT SIDEBAR (Estoque / Configurações)
═══════════════════════════════════════════════════════ */
.rb-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  position: sticky;
  top: 1.5rem;
}

.sidebar-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.sidebar-section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #475569;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0;
}

.sidebar-hint {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

/* Palette blocks list */
.palette-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 4rem;
  justify-content: center;
  border-radius: 0.5rem;
  transition: all 0.15s;
}

.palette-list--empty {
  border: 1.5px dashed #cbd5e1;
  background: #f8fafc;
}

.palette-empty-msg {
  font-size: 0.75rem;
  color: #94a3b8;
  text-align: center;
  padding: 1.25rem;
}

.palette-block {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border: 1.5px solid;
  border-radius: 0.5rem;
  background: #ffffff;
  cursor: default;
  transition: box-shadow 0.15s, transform 0.1s;
}

.palette-block:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  transform: translateY(-1px);
}

/* Drag handles */
.drag-handle {
  cursor: grab;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 0.25rem;
  padding: 0.125rem;
  transition: color 0.15s;
}

.drag-handle:hover { color: #475569; }
.drag-handle:active { cursor: grabbing; }
.drag-handle-icon { pointer-events: none; }
.block-icon { flex-shrink: 0; }

.block-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.block-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block-desc {
  font-size: 0.6875rem;
  color: #64748b;
  line-height: 1.4;
}

/* Toggle cards */
.toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  transition: border-color 0.15s;
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.toggle-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}

.toggle-desc {
  display: block;
  font-size: 0.6875rem;
  color: #64748b;
}

.toggle-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  border-radius: 0.25rem;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.toggle-btn:focus-visible { outline: 2px solid #1e40af; outline-offset: 2px; }
.t-icon-on { color: #1e40af; }
.t-icon-off { color: #94a3b8; }

/* Caixa Teste */
.caixa-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus {
  border-color: #1e40af;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.08);
}

/* ═══════════════════════════════════════════════════════
   RIGHT: TIMELINE
═══════════════════════════════════════════════════════ */
.rb-timeline-area {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-label-text {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.timeline-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.25rem 0.625rem;
  border-radius: 2rem;
  border: 1px solid #e2e8f0;
}

.timeline-track {
  display: flex;
  flex-direction: column;
  position: relative;
}

.tl-item {
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Connectors */
.tl-connector {
  width: 2px;
  height: 1.25rem;
  background: linear-gradient(to bottom, #e2e8f0, #cbd5e1);
  margin-left: 1.375rem;
  flex-shrink: 0;
}

.tl-connector--start {
  display: none;
}

/* Blocks styling */
.tl-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.625rem;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  transition: all 0.15s;
  position: relative;
  user-select: none;
}

.tl-block--fixo {
  border-color: #e2e8f0;
}

.tl-block--flutuante {
  border-style: dashed;
  border-color: #ddd6fe;
  background: #faf5ff;
  flex: 1;
}

.tl-block--flutuante:hover {
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.1);
  border-color: #a78bfa;
}

.tl-block--condicional {
  border-color: #fed7aa;
  background: #fff7ed;
}

.tl-block--end {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.tl-block--parallel {
  border-style: dashed;
}

.tl-drag-handle {
  position: absolute;
  left: -2rem;
}

.tl-block-left {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-width: 0;
  flex: 1;
}

.tl-block-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tl-block-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tl-block-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.tl-block-sub {
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
}

.tl-block-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.flex-row-layout {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.btn-remove-sector {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #64748b;
  border-radius: 0.375rem;
  padding: 0.3125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove-sector:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #ef4444;
}

.btn-remove-sector:focus-visible {
  outline: 2px solid #ef4444;
  outline-offset: 1px;
}

/* ─── Dropzones Intercaladas (Sequenciais) ─── */
.tl-dropzone-container {
  display: flex;
  flex-direction: column;
}

.intercalated-drop-area {
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
}

.intercalated-drop-area--empty {
  min-height: 0;
}

.intercalated-drop-area--visible {
  border: 1.5px dashed #cbd5e1;
  background: #f8fafc;
  border-radius: 0.625rem;
  min-height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.375rem 0;
  padding: 0.5rem;
}

.intercalated-placeholder {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
}

.tl-intercalated-item {
  display: flex;
  flex-direction: column;
}

/* ─── Dropzones Paralelas ─── */
.tl-parallel-wrapper {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}

.tl-parallel-wrapper--active {
  position: relative;
}

.parallel-drop-area {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.parallel-drop-area--active {
  flex: 1;
}

.parallel-drop-area--visible {
  border: 1.5px dashed #cbd5e1;
  background: #f8fafc;
  border-radius: 0.625rem;
  min-height: 4.25rem;
  min-width: 12rem;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
}

.parallel-drop-area--visible::after {
  content: 'Solte para paralelo';
  font-size: 0.6875rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ─── Badges ─── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.badge--fixo {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.badge--end {
  background: #f0fdf4;
  color: #166534;
  border-color: #bbf7d0;
}

.badge--flutuante {
  background: #f5f3ff;
  color: #7c3aed;
  border: 1px solid #ddd6fe;
}

.badge--condicional {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.badge--parallel {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fdba74;
}

/* Drag states */
.drag-ghost {
  opacity: 0.4;
  border: 2px dashed #818cf8 !important;
  background: #eef2ff !important;
}

.drag-active {
  box-shadow: 0 12px 30px rgba(0,0,0,0.15) !important;
  transform: rotate(1.5deg) !important;
  border-color: #818cf8 !important;
  z-index: 100;
}

/* ═══════════════════════════════════════════════════════
   ROUTE SUMMARY & CHIPS
═══════════════════════════════════════════════════════ */
.route-summary {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.75rem;
}

.summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.summary-chip--fixo {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.summary-chip--flutuante {
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}

.summary-chip--condicional {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.chip-num {
  width: 1.125rem;
  height: 1.125rem;
  background: rgba(0,0,0,0.1);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 800;
}

.chip-parallel-indicator {
  font-size: 0.625rem;
  color: #ea580c;
  font-weight: 700;
  text-transform: uppercase;
  margin-left: 0.25rem;
}

/* Transitions */
.block-pop-enter-active { transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.block-pop-leave-active { transition: all 0.18s ease; }
.block-pop-enter-from  { opacity: 0; transform: translateY(-8px) scale(0.96); }
.block-pop-leave-to    { opacity: 0; transform: translateY(-6px) scale(0.97); }

.field-reveal-enter-active { transition: all 0.2s ease; }
.field-reveal-leave-active { transition: all 0.15s ease; }
.field-reveal-enter-from   { opacity: 0; transform: translateY(-4px); max-height: 0; }
.field-reveal-leave-to     { opacity: 0; max-height: 0; }

/* TV / Ultra-wide scale */
@media (min-width: 1920px) {
  .tl-block-name { font-size: 1.0625rem; }
  .tl-block-sub  { font-size: 0.875rem; }
  .block-label   { font-size: 1rem; }
  .toggle-label  { font-size: 1rem; }
  .field-input   { font-size: 1rem; }
}

@media (min-width: 2560px) {
  .tl-block-name { font-size: 1.375rem; }
  .tl-block-sub  { font-size: 1.0625rem; }
  .tl-block-icon { width: 3rem; height: 3rem; }
  .block-label   { font-size: 1.25rem; }
  .tl-block      { padding: 1.25rem 1.5rem; }
  .badge         { font-size: 0.875rem; padding: 0.375rem 0.75rem; }
}
</style>
