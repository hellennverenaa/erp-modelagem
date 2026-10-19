<script setup lang="ts">
import { ref } from 'vue'
import {
  Activity,
  X,
  Clock,
  MapPin,
  Sliders,
  LogIn,
  LogOut,
  Timer,
  ChevronRight,
  User,
  Info,
} from '@lucide/vue'
import api from '../../api/axios'
import type {
  OrdemTeste,
  RastreamentoHistorico,
  HistoricoResponse,
} from './types'

const props = defineProps<{
  modelValue: boolean
  ordem: OrdemTeste | null
  canViewRastreamento: boolean
  modeloNome?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  openRastreamento: [ordem: OrdemTeste]
  error: [message: string]
}>()

const showTimeline = ref(false)
const timelineData = ref<RastreamentoHistorico[]>([])
const loadingTimeline = ref(false)

function fecharAcompanhamento() {
  emit('update:modelValue', false)
}

function abrirTimeline() {
  fecharAcompanhamento()
  if (props.ordem) {
    void openTimeline(props.ordem)
  }
}

function navegarRastreamento() {
  fecharAcompanhamento()
  if (props.ordem) {
    emit('openRastreamento', props.ordem)
  }
}

async function openTimeline(ordem: OrdemTeste) {
  timelineData.value = []
  showTimeline.value = true
  loadingTimeline.value = true
  try {
    const { data } = await api.get<HistoricoResponse>(`/rastreamentos/historico/${ordem.id}`)
    const raw = data.historico ?? []
    const grouped: RastreamentoHistorico[] = []
    for (const r of raw) {
      const g = grouped.find((x) => x.setorId === r.setorId)
      if (g && g.itens) {
        g.itens.push(r)
      } else {
        grouped.push({ ...r, itens: [r] })
      }
    }
    timelineData.value = grouped
  } catch {
    emit('error', 'Erro ao carregar histórico de rastreamento.')
    showTimeline.value = false
  } finally {
    loadingTimeline.value = false
  }
}

function closeTimeline() {
  showTimeline.value = false
  timelineData.value = []
}

const rastreamentoStatusConfig: Record<string, { label: string; cls: string; dotCls: string }> = {
  EM_PROCESSO: { label: 'Em Processo', cls: 'rstat--amber', dotCls: 'rdot--amber' },
  CONCLUIDO: { label: 'Concluído', cls: 'rstat--green', dotCls: 'rdot--green' },
  REPROVADO: { label: 'Reprovado', cls: 'rstat--red', dotCls: 'rdot--red' },
  EM_RETRABALHO: { label: 'Em Retrabalho', cls: 'rstat--orange', dotCls: 'rdot--orange' },
}

function getRastreamentoStatus(s: string) {
  return rastreamentoStatusConfig[s] ?? { label: s, cls: 'rstat--slate', dotCls: 'rdot--slate' }
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

function formatPermanencia(min: number | null) {
  if (min === null || min === undefined) return null
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
</script>

<template>
  <!-- Modal de seleção: Timeline vs Rastreamento Detalhado -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue && ordem"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-acompanhar"
        @click.self="fecharAcompanhamento"
      >
        <div class="modal-panel" style="max-width: 520px">
          <div class="modal-header">
            <div class="modal-header-left">
              <div class="modal-icon-wrap" aria-hidden="true"><Activity :size="20" /></div>
              <div>
                <h2 id="modal-title-acompanhar" class="modal-title">Acompanhar ordem</h2>
                <p class="modal-description">
                  {{ ordem.codigoBarras }} · {{ modeloNome || ordem.modelo?.nome }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Fechar opções de acompanhamento"
              @click="fecharAcompanhamento"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
          <div class="modal-body flex flex-col gap-3 p-5">
            <button
              type="button"
              class="btn-outline flex w-full items-center gap-3 p-4 text-left"
              @click="abrirTimeline"
            >
              <Clock :size="18" aria-hidden="true" />
              <span>
                <strong class="block text-slate-800">Timeline</strong>
                <small class="text-slate-500">Histórico de entradas, saídas e permanências</small>
              </span>
            </button>
            <button
              v-if="canViewRastreamento"
              type="button"
              class="btn-outline flex w-full items-center gap-3 p-4 text-left"
              @click="navegarRastreamento"
            >
              <Activity :size="18" aria-hidden="true" />
              <span>
                <strong class="block text-slate-800">Rastreamento detalhado</strong>
                <small class="text-slate-500">Visualização das trilhas da ordem</small>
              </span>
            </button>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-outline" @click="fecharAcompanhamento">Fechar</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Drawer lateral: Timeline de Rastreamento -->
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
                <p class="tl-subtitle" v-if="ordem">
                  Ordem
                  <span class="tl-code">{{ ordem.codigoBarras }}</span>
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
              <p class="tl-empty-sub">
                A bipagem das peças nesta ordem ainda não foi iniciada no chão de fábrica.
              </p>
            </div>

            <!-- Timeline list -->
            <ol v-else class="tl-list" aria-label="Histórico de rastreamento por setor">
              <li
                v-for="(item, idx) in timelineData"
                :key="item.id"
                class="tl-item"
              >
                <!-- Conector vertical -->
                <div
                  class="tl-connector"
                  :class="{ 'tl-connector--hidden': idx === timelineData.length - 1 }"
                  aria-hidden="true"
                ></div>

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
                  <div class="tl-lote-tag flex gap-2 flex-wrap">
                    <div v-for="subItem in item.itens" :key="subItem.id" class="flex items-center gap-1">
                      <ChevronRight :size="10" aria-hidden="true" />
                      <span
                        :class="
                          subItem.tipoLote === 'CAIXA_TESTE'
                            ? 'text-amber-600 font-bold'
                            : 'text-blue-600 font-bold'
                        "
                      >
                        {{
                          subItem.tipoLote === 'CAIXA_TESTE'
                            ? 'Caixa Teste (' + getRastreamentoStatus(subItem.status).label + ')'
                            : 'Lote Principal (' + getRastreamentoStatus(subItem.status).label + ')'
                        }}
                      </span>
                    </div>
                  </div>

                  <!-- Máquina / Estação -->
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

                  <!-- Tempo de permanência -->
                  <div v-if="formatPermanencia(item.tempoPermanenciaMin)" class="tl-permanencia">
                    <Timer :size="12" class="tl-perm-icon" aria-hidden="true" />
                    <span class="tl-perm-label">Permanência Real:</span>
                    <span class="tl-perm-val font-bold text-indigo-700">
                      {{ formatPermanencia(item.tempoPermanenciaMin) }}
                    </span>
                  </div>

                  <!-- Operadores -->
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
              <span>
                {{ timelineData.length }} rastreamento{{ timelineData.length !== 1 ? 's' : '' }} registrado{{ timelineData.length !== 1 ? 's' : '' }}
              </span>
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

.modal-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  width: 100%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #0f172a;
}

/* ─── Drawer Timeline Styles ─── */
.tl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
}

.tl-drawer {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.tl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.125rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.tl-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tl-icon-wrap {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: #eff6ff;
  color: #1d4ed8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tl-title {
  font-size: 0.9375rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

.tl-subtitle {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0.15rem 0 0;
}

.tl-code {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  color: #1d4ed8;
}

.tl-close {
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

.tl-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.tl-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  background: #f8fafc;
}

.tl-loading {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tl-skel-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.tl-skel-dot {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #e2e8f0;
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.tl-skel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.tl-skel {
  background: #e2e8f0;
  border-radius: 0.25rem;
  animation: pulse 1.5s ease-in-out infinite;
}

.tl-skel--title {
  width: 60%;
  height: 1rem;
}

.tl-skel--sub {
  width: 85%;
  height: 0.75rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.tl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 1.5rem;
  gap: 0.5rem;
}

.tl-empty-icon {
  color: #cbd5e1;
  margin-bottom: 0.25rem;
}

.tl-empty-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #334155;
}

.tl-empty-sub {
  font-size: 0.8125rem;
  color: #94a3b8;
  line-height: 1.5;
  max-width: 18rem;
}

.tl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.tl-item {
  display: flex;
  gap: 0.875rem;
  position: relative;
  align-items: flex-start;
}

.tl-connector {
  position: absolute;
  left: 0.4375rem;
  top: 1.125rem;
  bottom: 0;
  width: 2px;
  background: #e2e8f0;
  transform: translateX(-50%);
}

.tl-connector--hidden {
  background: transparent;
}

.tl-dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.375rem;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #cbd5e1;
  position: relative;
  z-index: 1;
}

.rdot--amber  { background: #d97706; box-shadow: 0 0 0 1px #d97706; }
.rdot--green  { background: #16a34a; box-shadow: 0 0 0 1px #16a34a; }
.rdot--red    { background: #dc2626; box-shadow: 0 0 0 1px #dc2626; }
.rdot--orange { background: #ea580c; box-shadow: 0 0 0 1px #ea580c; }
.rdot--slate  { background: #94a3b8; box-shadow: 0 0 0 1px #94a3b8; }

.tl-card {
  flex: 1;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
  margin-bottom: 0.875rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tl-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tl-setor-wrap {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.tl-setor-icon {
  color: #64748b;
  flex-shrink: 0;
}

.tl-setor-nome {
  font-size: 0.875rem;
  font-weight: 800;
  color: #0f172a;
}

.tl-tipo-setor {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 0.25rem;
  padding: 0.1rem 0.35rem;
}

.tl-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.rstat--amber  { background: #fef3c7; color: #92400e; }
.rstat--green  { background: #dcfce7; color: #166534; }
.rstat--red    { background: #fee2e2; color: #991b1b; }
.rstat--orange { background: #ffedd5; color: #9a3412; }
.rstat--slate  { background: #f1f5f9; color: #475569; }

.tl-lote-tag {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}

.tl-dates {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #f8fafc;
  border-radius: 0.375rem;
  padding: 0.375rem 0.625rem;
}

.tl-date-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.tl-date-icon {
  color: #94a3b8;
  flex-shrink: 0;
}

.tl-date-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  min-width: 4rem;
}

.tl-date-val {
  font-size: 0.8125rem;
  color: #0f172a;
  font-weight: 500;
}

.tl-permanencia {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.tl-perm-icon {
  color: #64748b;
  flex-shrink: 0;
}

.tl-perm-label {
  font-weight: 600;
  color: #64748b;
}

.tl-perm-val {
  font-weight: 800;
  color: #1d4ed8;
}

.tl-maquina-tag {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  background: #eef2ff;
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  color: #3730a3;
}

.tl-maquina-icon {
  color: #6366f1;
  flex-shrink: 0;
}

.tl-maquina-label {
  font-weight: 600;
  color: #3730a3;
}

.tl-maquina-val {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  color: #312e81;
}

.tl-operadores {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  border-top: 1px solid #f1f5f9;
  padding-top: 0.5rem;
  background: #f8fafc;
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
}

.tl-op-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #334155;
}

.tl-op-icon {
  color: #64748b;
  flex-shrink: 0;
}

.tl-op-title {
  font-weight: 700;
  color: #1e293b;
}

.tl-op-list {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #475569;
  flex-wrap: wrap;
}

.tl-op-tag {
  font-weight: 700;
  color: #334155;
}

.tl-op-sep {
  color: #cbd5e1;
}

.tl-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
}

.tl-footer-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
}

/* Animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-enter-active .tl-drawer,
.drawer-leave-active .tl-drawer {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .tl-drawer,
.drawer-leave-to .tl-drawer {
  transform: translateX(100%);
}
</style>
