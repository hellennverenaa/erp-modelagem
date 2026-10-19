<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Settings,
  X,
  Sliders,
  Scissors,
  History,
  Clock,
  Lock,
  ShieldCheck,
  Loader2,
} from '@lucide/vue'
import api from '../../api/axios'
import type {
  OrdemTeste,
  SlaSetorFormItem,
  RastreamentoHistorico,
  HistoricoResponse,
} from './types'

const props = defineProps<{
  modelValue: boolean
  ordem: OrdemTeste | null
  canConfigureOrdem: boolean
  canEditSla: boolean
  ordens?: OrdemTeste[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [loteAtualizado: any]
  success: [message: string]
  error: [message: string]
}>()

const activeTab = ref<'geral' | 'pecas' | 'historico'>('geral')
const loadingManutencao = ref(false)
const loadingAuditoria = ref(false)

const formManutencao = ref({
  slas: [] as SlaSetorFormItem[],
  pecas: [] as Array<{ id: string; nome: string; setorCorteOpcaoId: string }>,
})

const maquinasCorteManutencao = ref<Array<{ id: string; label: string; valor: string }>>([])
const manutencaoRastreamentos = ref<RastreamentoHistorico[]>([])
const logsAuditoria = ref<
  Array<{
    id: string
    acao: string
    entidadeTipo: string
    dadosAnteriores: Record<string, any> | null
    dadosNovos: Record<string, any> | null
    ipAddress: string | null
    criadoEm: string
    usuario: { id: string; nome?: string; nomeCompleto?: string; usuario?: string } | null
  }>
>([])

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen && props.ordem) {
      await inicializarModal(props.ordem)
    } else {
      activeTab.value = 'geral'
      logsAuditoria.value = []
      manutencaoRastreamentos.value = []
    }
  }
)

function fechar() {
  emit('update:modelValue', false)
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

async function inicializarModal(ordem: OrdemTeste) {
  activeTab.value = 'geral'
  logsAuditoria.value = []
  manutencaoRastreamentos.value = []

  const ordemSlaMap: Record<string, number> = ordem.slasPorSetor || {}
  const modeloSlaMap: Record<string, number> = (ordem.modelo as any)?.slasPorSetor || {}

  let rotaSetores: Array<{ id: string; nome: string; ordem: number; slaAlvoMin?: number | null }> = []

  if (
    Array.isArray(ordem.modelo?.rotas) &&
    ordem.modelo!.rotas!.some((r: any) => (r.plantaId || r.planta?.id) === ordem.plantaId)
  ) {
    rotaSetores = ordem.modelo!.rotas!
      .filter((r: any) => (r.plantaId || r.planta?.id) === ordem.plantaId)
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => ({ id: r.setor.id, nome: r.setor.nome, ordem: r.ordem, slaAlvoMin: r.slaAlvoMin }))
  } else if (ordem.modeloId) {
    try {
      const resRota = await api.get(`/rotas/${ordem.modeloId}`, { params: { plantaId: ordem.plantaId } })
      const rotaData = resRota.data.rota || resRota.data.rotas || resRota.data.modelo?.rotas || resRota.data
      if (Array.isArray(rotaData) && rotaData.length > 0) {
        rotaSetores = (rotaData as any[])
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
          .map((r) => ({
            id: r.setor?.id || r.setorId || r.id,
            nome: r.setor?.nome || r.setorNome || r.nome || 'Setor',
            ordem: r.ordem || 0,
            slaAlvoMin: r.slaAlvoMin ?? r.sla_alvo_min ?? null,
          }))
        if (ordem.modelo) {
          ;(ordem.modelo as any).rotas = rotaData
        }
      }
      const modeloData = resRota.data.modelo || resRota.data
      if (modeloData?.slasPorSetor && typeof modeloData.slasPorSetor === 'object') {
        Object.assign(modeloSlaMap, modeloData.slasPorSetor)
      }
    } catch (err) {
      console.warn('[OrderMaintenanceModal] Erro ao buscar rota do modelo:', err)
    }
  }

  const slasItems: SlaSetorFormItem[] = rotaSetores.map((setor) => {
    const rawMin =
      ordem.slasPorSetor != null
        ? ordemSlaMap[setor.nome] ?? ordemSlaMap[setor.id] ?? 0
        : setor.slaAlvoMin ?? modeloSlaMap[setor.nome] ?? modeloSlaMap[setor.id]
    if (rawMin !== undefined && rawMin !== null) {
      const { valor, unidade } = hydratateReverseSla(rawMin)
      return { setorKey: setor.id, setorNome: setor.nome, valor, unidade }
    }
    return { setorKey: setor.id, setorNome: setor.nome, valor: 0, unidade: 'min' as const }
  })

  const rotaIds = new Set(rotaSetores.map((s) => s.id))
  const rotaNomes = new Set(rotaSetores.map((s) => s.nome))
  Object.keys(ordemSlaMap).forEach((k) => {
    if (k !== 'default' && !rotaIds.has(k) && !rotaNomes.has(k)) {
      const { valor, unidade } = hydratateReverseSla(ordemSlaMap[k])
      slasItems.push({ setorKey: k, setorNome: k, valor, unidade })
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
      console.warn('[OrderMaintenanceModal] Erro ao buscar peças dinâmicas:', err)
    }
  }

  formManutencao.value = {
    slas: slasItems,
    pecas: pecasList.map((p) => ({
      id: p.id,
      nome: p.nome,
      setorCorteOpcaoId:
        ordem.pecasRemanejadas?.[p.id] ||
        (p as any).setorCorteOpcaoId ||
        (p as any).setorCorteOpcao?.id ||
        '',
    })),
  }

  try {
    const res = await api
      .get<any[]>('/config/opcoes/subsetor_corte')
      .catch(() =>
        api.get<any[]>('/admin/config-opcoes', { params: { categoria: 'subsetor_corte' } })
      )
    maquinasCorteManutencao.value = (res.data || []).map((m: any) => ({
      id: m.id,
      label: m.label || m.valor,
      valor: m.valor,
    }))
  } catch (err) {
    console.error('[OrderMaintenanceModal] Erro ao buscar máquinas de corte:', err)
  }
}

async function loadHistorico() {
  activeTab.value = 'historico'
  if (!props.ordem) return
  loadingAuditoria.value = true
  logsAuditoria.value = []
  manutencaoRastreamentos.value = []

  const [auditoriaResult, rastreamentoResult] = await Promise.allSettled([
    api.get(`/lotes/${props.ordem.id}/auditoria`),
    api.get<HistoricoResponse>(`/rastreamentos/historico/${props.ordem.id}`),
  ])

  const falhas: string[] = []
  if (auditoriaResult.status === 'fulfilled') {
    logsAuditoria.value = auditoriaResult.value.data || []
  } else {
    console.error('[loadHistorico] Erro ao buscar auditoria de configuração:', auditoriaResult.reason)
    falhas.push('alterações de configuração')
  }
  if (rastreamentoResult.status === 'fulfilled') {
    manutencaoRastreamentos.value = rastreamentoResult.value.data.historico || []
  } else {
    console.error('[loadHistorico] Erro ao buscar rastreamentos da ordem:', rastreamentoResult.reason)
    falhas.push('movimentações por setor')
  }
  if (falhas.length) {
    emit('error', `Não foi possível carregar ${falhas.join(' e ')}.`)
  }

  loadingAuditoria.value = false
}

function getSetorNome(key: string): string {
  if (!key) return '-'
  if (key === 'default') return 'SLA Padrão'

  const itemForm = formManutencao.value.slas.find((s) => s.setorKey === key || s.setorNome === key)
  if (itemForm?.setorNome) return itemForm.setorNome

  const rotas = props.ordem?.modelo?.rotas || (props.ordem?.modelo as any)?.rota_modelo
  if (Array.isArray(rotas)) {
    const match = rotas.find((r: any) => r.setor?.id === key || r.setorId === key || r.setor?.nome === key)
    if (match?.setor?.nome) return match.setor.nome
  }

  if (props.ordens) {
    for (const o of props.ordens) {
      const rList = o.modelo?.rotas || (o.modelo as any)?.rota_modelo
      if (Array.isArray(rList)) {
        const match = rList.find((r: any) => r.setor?.id === key || r.setorId === key)
        if (match?.setor?.nome) return match.setor.nome
      }
    }
  }

  return key
}

function formatSlaDiff(dadosAnt: Record<string, any> | null, dadosNov: Record<string, any> | null): string {
  const oldObj = dadosAnt || {}
  const newObj = dadosNov || {}

  const keys = Object.keys(newObj).filter((k) => k !== 'default')
  if (keys.length === 0) {
    const oldKeys = Object.keys(oldObj).filter((k) => k !== 'default')
    if (oldKeys.length === 0) return '-'
    return oldKeys.map((k) => `${getSetorNome(k)}: ${oldObj[k]} min`).join('\n')
  }

  return keys
    .map((k) => {
      const nomeSector = getSetorNome(k)
      const vOld = oldObj[k] !== undefined && oldObj[k] !== null ? `${oldObj[k]} min` : '0 min'
      const vNew = newObj[k] !== undefined && newObj[k] !== null ? `${newObj[k]} min` : '0 min'
      return `${nomeSector}: ${vOld} ➔ ${vNew}`
    })
    .join('\n')
}

function formatPecaRemanejada(dadosAnt: Record<string, any> | null, dadosNov: Record<string, any> | null): string {
  const pecaNome = dadosNov?.pecaNome || dadosAnt?.pecaNome || 'Peça'
  const origem = dadosAnt?.maquinaNome || dadosAnt?.setorCorteOpcaoId || 'Sem máquina'
  const destino = dadosNov?.maquinaNome || dadosNov?.setorCorteOpcaoId || 'Sem máquina'
  return `Peça ${String(pecaNome).toUpperCase()} remanejada do subsetor ${origem} para ${destino}`
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const rastreamentoStatusConfig: Record<string, { label: string }> = {
  EM_PROCESSO: { label: 'Em Processo' },
  CONCLUIDO: { label: 'Concluído' },
  REPROVADO: { label: 'Reprovado' },
  EM_RETRABALHO: { label: 'Em Retrabalho' },
}

function getRastreamentoStatus(s: string) {
  return rastreamentoStatusConfig[s] ?? { label: s }
}

async function salvar() {
  if (!props.ordem) return
  loadingManutencao.value = true
  try {
    const payload: any = {
      pecas: formManutencao.value.pecas
        .filter((p) => p.setorCorteOpcaoId)
        .map((p) => ({
          id: p.id,
          setorCorteOpcaoId: p.setorCorteOpcaoId,
        })),
    }

    if (props.canEditSla) {
      const slasPorSetorPayload: Record<string, number> = {}
      for (const item of formManutencao.value.slas) {
        let min = Number(item.valor) || 0
        if (item.unidade === 'd') min *= 1440
        else if (item.unidade === 'h') min *= 60
        if (min > 0) slasPorSetorPayload[item.setorKey] = min
      }
      payload.slasPorSetor = slasPorSetorPayload
    }

    const response = await api.put(`/ordens-teste/${props.ordem.id}/manutencao`, payload)
    const loteAtualizado = response.data.lote || response.data

    if (Array.isArray(loteAtualizado.auditLogs)) {
      logsAuditoria.value = loteAtualizado.auditLogs
    }

    emit('success', 'Configuração da Ordem salva com sucesso!')
    emit('saved', loteAtualizado)
    fechar()
  } catch (err: any) {
    console.error('[OrderMaintenanceModal] Erro:', err)
    emit('error', err.response?.data?.error || 'Erro ao salvar configuração da ordem.')
  } finally {
    loadingManutencao.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue && ordem"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-configuracao"
        @click.self="fechar"
      >
        <div class="modal-panel modal-panel--manutencao">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-header-left">
              <div class="modal-icon-wrap" aria-hidden="true">
                <Settings :size="20" />
              </div>
              <div>
                <h2 id="modal-title-configuracao" class="modal-title">
                  Configuração da Ordem {{ ordem?.codigoBarras }}
                </h2>
                <p class="modal-description">
                  Edite prazos, metas de tempo (SLA) ou altere a máquina de peças técnicas.
                </p>
              </div>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Fechar modal"
              @click="fechar"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <!-- Abas -->
          <div class="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 bg-slate-50 overflow-x-auto">
            <button
              type="button"
              class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
              :class="
                activeTab === 'geral'
                  ? 'border-blue-700 text-blue-800 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70'
              "
              @click="activeTab = 'geral'"
            >
              <div class="flex items-center gap-1.5">
                <Sliders :size="13" />
                <span>1. Prazos e SLAs</span>
              </div>
            </button>
            <button
              type="button"
              class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
              :class="
                activeTab === 'pecas'
                  ? 'border-blue-700 text-blue-800 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70'
              "
              @click="activeTab = 'pecas'"
            >
              <div class="flex items-center gap-1.5">
                <Scissors :size="13" />
                <span>2. Remanejamento ({{ formManutencao.pecas.length }})</span>
              </div>
            </button>
            <button
              type="button"
              class="px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap"
              :class="
                activeTab === 'historico'
                  ? 'border-blue-700 text-blue-800 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70'
              "
              @click="loadHistorico"
            >
              <div class="flex items-center gap-1.5">
                <History :size="13" />
                <span>3. Histórico</span>
              </div>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body p-6 space-y-4">
            <!-- ABA 1: Prazos e SLAs -->
            <div v-if="activeTab === 'geral'" class="space-y-5">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                  <Clock :size="14" class="text-slate-500 shrink-0" />
                  <span class="text-xs font-black text-slate-800 uppercase tracking-widest">
                    Prazos de SLA por Setor
                  </span>
                </div>
                <span
                  v-if="!canEditSla"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold"
                >
                  <Lock :size="11" />
                  Somente leitura
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold"
                >
                  <ShieldCheck :size="11" />
                  Edição liberada
                </span>
              </div>

              <!-- Grid de cards SLA -->
              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-1 w-full">
                <div
                  v-for="s in formManutencao.slas"
                  :key="s.setorKey"
                  class="bg-slate-50/70 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 flex flex-col gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.02)] text-slate-800 transition-colors"
                  :class="canEditSla ? 'hover:border-blue-500/50' : 'opacity-80'"
                >
                  <div class="flex items-center justify-between min-w-0">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <Clock
                        :size="13"
                        class="shrink-0"
                        :class="canEditSla ? 'text-blue-700' : 'text-slate-400'"
                      />
                      <span class="text-sm font-bold truncate text-slate-800">{{ s.setorNome }}</span>
                    </div>
                    <Lock v-if="!canEditSla" :size="12" class="text-amber-500 shrink-0 ml-2" />
                  </div>

                  <div class="h-px bg-slate-200/60"></div>

                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      v-model.number="s.valor"
                      :disabled="!canEditSla"
                      class="w-20 px-3 py-2 text-sm font-bold font-mono text-slate-900 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <select
                      v-model="s.unidade"
                      :disabled="!canEditSla"
                      class="flex-1 min-w-[100px] px-3 py-2 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="min">Minutos</option>
                      <option value="h">Horas</option>
                      <option value="d">Dias</option>
                    </select>
                  </div>

                  <p class="text-xs font-semibold text-slate-500 text-right tabular-nums">
                    = {{ s.unidade === 'd' ? s.valor * 1440 : s.unidade === 'h' ? s.valor * 60 : s.valor }} min
                  </p>
                </div>
              </div>
            </div>

            <!-- ABA 2: Remanejamento de Peças -->
            <div v-else-if="activeTab === 'pecas'" class="space-y-3">
              <p class="text-xs text-slate-500">
                Altere a máquina de destino de cada peça técnica do corte automático:
              </p>

              <div
                v-if="formManutencao.pecas.length === 0"
                class="p-4 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs"
              >
                Este modelo não possui peças cadastradas para remanejamento.
              </div>

              <div v-else class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                <div
                  v-for="p in formManutencao.pecas"
                  :key="p.id"
                  class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div class="text-xs font-bold text-slate-800">{{ p.nome }}</div>
                  <div class="sm:w-64">
                    <select
                      v-model="p.setorCorteOpcaoId"
                      :disabled="!canConfigureOrdem"
                      class="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-800"
                    >
                      <option value="">Selecione a máquina...</option>
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

            <!-- ABA 3: Histórico -->
            <div v-else-if="activeTab === 'historico'" class="space-y-3">
              <div v-if="loadingAuditoria" class="flex items-center justify-center py-12 gap-2">
                <Loader2 :size="18" class="animate-spin text-blue-600" />
                <span class="text-slate-400 text-sm">Carregando histórico...</span>
              </div>

              <div
                v-else-if="logsAuditoria.length === 0 && manutencaoRastreamentos.length === 0"
                class="p-8 text-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-2xl bg-slate-50/50"
              >
                <History :size="28" class="mx-auto mb-2 text-slate-300" />
                <p>Nenhuma movimentação ou alteração registrada para esta ordem.</p>
              </div>

              <div v-else class="max-h-80 overflow-y-auto pr-1 space-y-5">
                <section class="space-y-2">
                  <h3 class="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Movimentações pelos setores
                  </h3>
                  <p v-if="manutencaoRastreamentos.length === 0" class="text-xs text-slate-400">
                    Nenhum rastreamento registrado.
                  </p>
                  <article
                    v-for="item in manutencaoRastreamentos"
                    :key="item.id"
                    class="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-bold text-slate-800">
                        {{ item.setor?.nome || 'Setor desconhecido' }}
                      </span>
                      <span class="text-[10px] font-bold text-slate-500">
                        {{ getRastreamentoStatus(item.status).label }}
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-500">
                      Entrada: {{ formatDateTime(item.dataEntrada) }} · Saída: {{ formatDateTime(item.dataSaida) }}
                    </p>
                    <p class="text-[11px] text-slate-500">
                      Operadores: {{ item.operadorEntrada?.nomeCompleto || '—' }} → {{ item.operadorSaida?.nomeCompleto || '—' }}
                    </p>
                  </article>
                </section>

                <section class="space-y-2">
                  <h3 class="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Alterações de configuração
                  </h3>
                  <p v-if="logsAuditoria.length === 0" class="text-xs text-slate-400">
                    Nenhuma alteração de SLA ou remanejamento registrado.
                  </p>
                  <article
                    v-for="log in logsAuditoria"
                    :key="log.id"
                    class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 transition-colors hover:border-blue-300 hover:shadow-sm"
                  >
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-black tracking-wider uppercase"
                      >
                        <ShieldCheck :size="10" />
                        {{ log.acao }}
                      </span>
                      <span class="text-slate-400 text-xs font-mono">
                        {{ new Date(log.criadoEm).toLocaleString('pt-BR') }}
                      </span>
                    </div>

                    <div class="flex items-center gap-2">
                      <span class="text-slate-500 text-xs font-semibold">Operador:</span>
                      <span class="text-slate-800 text-xs font-bold">
                        {{ log.usuario?.nomeCompleto || log.usuario?.nome || log.usuario?.usuario || 'Sistema' }}
                      </span>
                    </div>

                    <div
                      v-if="log.acao === 'PECA_REMANEJADA'"
                      class="bg-blue-50 rounded-lg p-3 border border-blue-200"
                    >
                      <p class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <Scissors :size="13" class="text-blue-700 shrink-0" />
                        <span>{{ formatPecaRemanejada(log.dadosAnteriores, log.dadosNovos) }}</span>
                      </p>
                    </div>
                    <div
                      v-else-if="log.acao === 'SLA_ALTERADO' && (log.dadosAnteriores || log.dadosNovos)"
                      class="bg-slate-50 rounded-lg p-3 border border-slate-200"
                    >
                      <p class="text-slate-500 text-xs font-bold mb-1 uppercase tracking-wide">
                        Alteração de SLA
                      </p>
                      <pre class="text-slate-800 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">{{ formatSlaDiff(log.dadosAnteriores, log.dadosNovos) }}</pre>
                    </div>
                  </article>
                </section>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button
              type="button"
              class="btn-outline"
              @click="fechar"
              :disabled="loadingManutencao"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn-primary"
              @click="salvar"
              v-if="canConfigureOrdem"
              :disabled="loadingManutencao"
            >
              <Loader2 v-if="loadingManutencao" :size="14" class="animate-spin" />
              <span>{{ loadingManutencao ? 'Salvando...' : 'Salvar Configuração' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-panel--manutencao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: #eff6ff;
  color: #1d4ed8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

.modal-description {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.15rem 0 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.modal-body {
  background: #ffffff;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5625rem 1.125rem;
  border-radius: 0.5rem;
  border: 1px solid #1d4ed8;
  background: #1d4ed8;
  color: #ffffff;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #1e40af;
  border-color: #1e40af;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5625rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #0f172a;
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-panel--manutencao,
.modal-leave-active .modal-panel--manutencao {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel--manutencao,
.modal-leave-to .modal-panel--manutencao {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}
</style>
