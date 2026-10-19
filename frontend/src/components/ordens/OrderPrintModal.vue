<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Printer,
  X,
  AlertCircle,
  Loader2,
} from '@lucide/vue'
import api from '../../api/axios'
import type {
  OrdemTeste,
  TicketSetorInfo,
  TicketsSetorResponse,
  GrupoImpressaoTickets,
} from './types'

const props = defineProps<{
  modelValue: boolean
  ordem: OrdemTeste | null
  canPrint: boolean
  modeloNome?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  error: [message: string]
}>()

const ticketsSetorItems = ref<TicketSetorInfo[]>([])
const ticketsSetorModeloNome = ref('')
const rotaTicketsCongelada = ref<boolean | null>(null)
const loadingTicketsSetor = ref(false)
const erroTicketsSetor = ref('')
const loadingTicketPrintId = ref<GrupoImpressaoTickets | null>(null)

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen && props.ordem) {
      await carregarTickets(props.ordem)
    } else {
      ticketsSetorItems.value = []
      erroTicketsSetor.value = ''
      rotaTicketsCongelada.value = null
    }
  }
)

function fechar() {
  emit('update:modelValue', false)
}

async function carregarTickets(ordem: OrdemTeste) {
  ticketsSetorItems.value = []
  ticketsSetorModeloNome.value = props.modeloNome || ordem.modelo?.nome || ''
  rotaTicketsCongelada.value = null
  erroTicketsSetor.value = ''
  loadingTicketsSetor.value = true

  try {
    const { data } = await api.get<TicketsSetorResponse>(`/lotes/${ordem.id}/tickets-setor`)
    ticketsSetorItems.value = Array.isArray(data.tickets) ? data.tickets : []
    ticketsSetorModeloNome.value = data.modeloNome || ticketsSetorModeloNome.value
    rotaTicketsCongelada.value = typeof data.rotaCongelada === 'boolean' ? data.rotaCongelada : null
  } catch (err: any) {
    console.error('[TicketsSetor] Erro ao carregar tickets da ordem:', err)
    const responseData = err?.response?.data
    const rotaAusente =
      err?.response?.status === 404 &&
      ((typeof responseData === 'string' && /Cannot GET|Cannot POST/i.test(responseData)) ||
        !responseData?.code)
    erroTicketsSetor.value = rotaAusente
      ? 'A API em execução não reconheceu a rota de tickets por setor. Reinicie o backend e confirme que o gateway aponta para esta versão do projeto.'
      : responseData?.error || 'Não foi possível carregar os tickets desta ordem.'
  } finally {
    loadingTicketsSetor.value = false
  }
}

async function imprimirTickets(ordem: OrdemTeste, grupo: GrupoImpressaoTickets) {
  if (loadingTicketPrintId.value) return

  const printWindow = window.open('about:blank', '_blank')
  if (!printWindow) {
    emit('error', 'O navegador bloqueou a janela de impressão dos tickets.')
    return
  }

  const endpoint =
    grupo === 'CORTE'
      ? '/etiquetas/tickets-corte'
      : grupo === 'TODOS'
        ? '/etiquetas/tickets-ordem'
        : '/etiquetas/tickets-setor'
  const payload = {
    ordemTesteId: ordem.id,
    ...(grupo === 'LOTE_PRINCIPAL' || grupo === 'CAIXA_TESTE' ? { tipoLote: grupo } : {}),
  }

  loadingTicketPrintId.value = grupo
  printWindow.document.write(
    '<!doctype html><title>Gerando tickets...</title><p style="font:16px sans-serif;padding:24px">Gerando PDF dos tickets...</p>'
  )
  try {
    const { data } = await api.post(endpoint, payload, { responseType: 'blob' })
    const pdfUrl = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    printWindow.location.replace(pdfUrl)
    setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 60000)
  } catch (err: any) {
    printWindow.close()
    console.error(`[TicketsSetor] Erro ao gerar PDF do grupo ${grupo}:`, err)
    const responseData = err?.response?.data
    let message = 'Não foi possível gerar o PDF dos tickets.'
    if (responseData instanceof Blob) {
      const responseText = await responseData.text()
      try {
        message = JSON.parse(responseText)?.error || message
      } catch {
        if (err?.response?.status === 404 && /text\/html/i.test(responseData.type)) {
          message =
            'A API em execução não reconheceu a rota de impressão. Reinicie o backend e confirme o destino do gateway.'
        }
      }
    }
    emit('error', message)
  } finally {
    loadingTicketPrintId.value = null
  }
}

function imprimirTicketsCorte(ordem: OrdemTeste) {
  return imprimirTickets(ordem, 'CORTE')
}

function imprimirTodosTicketsSetor() {
  if (!props.ordem) return
  return imprimirTickets(props.ordem, 'TODOS')
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
        aria-labelledby="modal-title-tickets-setor"
        @click.self="fechar"
      >
        <div class="modal-panel modal-panel--tickets-setor" style="max-width: 820px">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-header-left">
              <div class="modal-icon-wrap" aria-hidden="true">
                <Printer :size="20" />
              </div>
              <div>
                <h2 id="modal-title-tickets-setor" class="modal-title">Etiquetas da ordem</h2>
                <p class="modal-description">
                  Ordem {{ ordem?.codigoBarras }} · {{ ticketsSetorModeloNome || ordem?.modelo?.nome }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Fechar etiquetas da ordem"
              @click="fechar"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body modal-body--tickets-setor p-5">
            <p class="mb-3 text-sm text-slate-600">
              Imprima os tickets da rota do Lote Principal, da Caixa Teste e dos subsetores de Corte.
            </p>

            <section
              v-if="canPrint && ordem"
              class="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4"
              aria-label="Impressões da ordem"
            >
              <h3 class="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                Imprimir etiquetas e tickets
              </h3>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-outline inline-flex items-center gap-2"
                  :disabled="loadingTicketPrintId !== null"
                  @click="imprimirTickets(ordem, 'LOTE_PRINCIPAL')"
                >
                  <Loader2
                    v-if="loadingTicketPrintId === 'LOTE_PRINCIPAL'"
                    :size="14"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Printer v-else :size="14" aria-hidden="true" />
                  {{ loadingTicketPrintId === 'LOTE_PRINCIPAL' ? 'Gerando...' : 'Lote principal' }}
                </button>
                <button
                  v-if="ordem.possuiCaixaTeste"
                  type="button"
                  class="btn-outline inline-flex items-center gap-2"
                  :disabled="loadingTicketPrintId !== null"
                  @click="imprimirTickets(ordem, 'CAIXA_TESTE')"
                >
                  <Loader2
                    v-if="loadingTicketPrintId === 'CAIXA_TESTE'"
                    :size="14"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Printer v-else :size="14" aria-hidden="true" />
                  {{ loadingTicketPrintId === 'CAIXA_TESTE' ? 'Gerando...' : 'Caixa Teste' }}
                </button>
                <button
                  type="button"
                  class="btn-outline inline-flex items-center gap-2"
                  :disabled="loadingTicketPrintId !== null"
                  @click="imprimirTicketsCorte(ordem)"
                >
                  <Loader2
                    v-if="loadingTicketPrintId === 'CORTE'"
                    :size="14"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Printer v-else :size="14" aria-hidden="true" />
                  {{ loadingTicketPrintId === 'CORTE' ? 'Gerando...' : 'Tickets de Corte' }}
                </button>
              </div>
            </section>

            <div class="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              A impressão completa reúne Lote Principal, Caixa Teste quando ativada e Corte em um PDF. O gabarito comporta 10 etiquetas por folha A4, em 2 colunas por 5 linhas, com início a 13 mm do topo.
            </div>

            <div
              v-if="loadingTicketsSetor"
              class="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-500"
              role="status"
            >
              <Loader2 :size="18" class="animate-spin" aria-hidden="true" />
              Carregando tickets da ordem...
            </div>

            <div
              v-else-if="erroTicketsSetor"
              class="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              role="alert"
            >
              <AlertCircle :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{{ erroTicketsSetor }}</span>
            </div>

            <div
              v-else-if="ticketsSetorItems.length === 0"
              class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <template v-if="rotaTicketsCongelada === false">
                A rota desta ordem ainda não foi definida e congelada. Finalize a configuração da Modelagem para gerar os tickets dos setores.
              </template>
              <template v-else-if="rotaTicketsCongelada === true">
                A rota está congelada, mas nenhum ticket foi retornado. Atualize a tela; se a mensagem persistir, confirme se o backend em execução está atualizado.
              </template>
              <template v-else>
                Esta ordem ainda não possui tickets de setor. Verifique se a rota da ordem já foi definida e congelada.
              </template>
            </div>

            <ol v-else class="space-y-2 max-h-72 overflow-y-auto pr-1" aria-label="Tickets dos setores da ordem">
              <li
                v-for="ticket in ticketsSetorItems"
                :key="ticket.id"
                class="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div class="min-w-0">
                  <p class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                    {{ ticket.tipoLote === 'CAIXA_TESTE' ? 'Caixa Teste' : 'Lote Principal' }} · Etapa {{ ticket.ordemEtapa }} · Rota v{{ ticket.rotaVersao }}
                  </p>
                  <h3 class="mt-0.5 truncate text-sm font-semibold text-slate-900">{{ ticket.setorNomeSnapshot }}</h3>
                  <p class="mt-1 break-all font-mono text-xs text-slate-600">{{ ticket.codigoBarras }}</p>
                </div>
              </li>
            </ol>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button type="button" class="btn-outline" @click="fechar">Fechar</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="loadingTicketsSetor || ticketsSetorItems.length === 0 || loadingTicketPrintId !== null"
              @click="imprimirTodosTicketsSetor"
            >
              <Loader2
                v-if="loadingTicketPrintId === 'TODOS'"
                :size="15"
                class="animate-spin"
                aria-hidden="true"
              />
              <Printer v-else :size="15" aria-hidden="true" />
              {{ loadingTicketPrintId === 'TODOS' ? 'Gerando PDF...' : 'Imprimir todos os setores' }}
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
</style>
