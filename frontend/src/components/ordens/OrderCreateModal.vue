<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Plus,
  X,
  AlertCircle,
  ChevronDown,
  Loader2,
} from '@lucide/vue'
import api from '../../api/axios'
import { formatDateOnly } from '../../utils/date'
import type { Modelo, Planta } from './types'

const props = defineProps<{
  modelValue: boolean
  modelos: Modelo[]
  plantas: Planta[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
  success: [message: string]
  error: [message: string]
}>()

const form = ref({
  modeloId: '',
  plantaId: '',
  prioridadePcp: '',
  observacoes: '',
})

const formErrors = ref<Record<string, string>>({})
const loadingCreate = ref(false)

const modeloFormSelecionado = computed(() =>
  props.modelos.find((m) => m.id === form.value.modeloId)
)

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      form.value = { modeloId: '', plantaId: '', prioridadePcp: '', observacoes: '' }
      formErrors.value = {}
    }
  }
)

function closeModal() {
  emit('update:modelValue', false)
}

async function handleCreateOrdem() {
  formErrors.value = {}

  if (!form.value.modeloId) formErrors.value.modeloId = 'Selecione um modelo.'
  if (!form.value.plantaId) formErrors.value.plantaId = 'Selecione uma planta.'
  if (!form.value.prioridadePcp) formErrors.value.prioridadePcp = 'Selecione a prioridade.'
  const modeloSelecionado = props.modelos.find((modelo) => modelo.id === form.value.modeloId)
  if (modeloSelecionado && !modeloSelecionado.dataCorte) {
    formErrors.value.modeloId = 'Cadastre a previsão de corte do modelo antes de criar a ordem.'
  }

  if (Object.keys(formErrors.value).length > 0) return

  loadingCreate.value = true
  try {
    await api.post('/ordens-teste/wizard/ordem', {
      modeloId: form.value.modeloId,
      plantaId: form.value.plantaId,
      prioridadePcp: form.value.prioridadePcp,
      observacoes: form.value.observacoes || null,
    })
    emit('success', 'Ordem criada com status Aguardando Modelagem.')
    emit('created')
    closeModal()
  } catch (err: any) {
    const code = err?.response?.data?.code
    const serverMsg = err?.response?.data?.error

    if (code === 'MODELO_TESTE_DUPLICADO') {
      const cb = err?.response?.data?.codigoBarras
      emit(
        'error',
        cb
          ? `Este modelo já possui a ordem ativa: ${cb}. Cada modelo admite apenas um teste de produção.`
          : 'Este modelo já possui um teste de produção ativo. Regra 1:1.'
      )
    } else {
      emit(
        'error',
        typeof serverMsg === 'string'
          ? serverMsg
          : 'Erro ao criar ordem. Verifique os dados e tente novamente.'
      )
    }
  } finally {
    loadingCreate.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
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
              <span v-else-if="form.modeloId" class="form-help">
                Previsão de corte: {{ formatDateOnly(modeloFormSelecionado?.dataCorte) }}
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
              <span>O código de barras será gerado automaticamente. A ordem aguardará a configuração de peças, Caixa Teste e rota pela Modelagem.</span>
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
  max-width: 520px;
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

.modal-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
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
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  background: #ffffff;
}

.modal-description {
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.5;
  margin: 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.required-star {
  color: #dc2626;
  font-weight: 800;
}

.optional-tag {
  font-size: 0.6875rem;
  font-weight: 500;
  color: #94a3b8;
}

.select-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.form-select {
  width: 100%;
  padding: 0.5625rem 2.25rem 0.5625rem 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: #0f172a;
  background: #ffffff;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-select:focus {
  outline: none;
  border-color: #1d4ed8;
  box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
}

.form-select--error {
  border-color: #ef4444;
}

.select-chevron {
  position: absolute;
  right: 0.875rem;
  pointer-events: none;
  color: #94a3b8;
}

.form-textarea {
  width: 100%;
  padding: 0.5625rem 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: #0f172a;
  background: #ffffff;
  resize: vertical;
  min-height: 4.5rem;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: none;
  border-color: #1d4ed8;
  box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: #dc2626;
  font-weight: 600;
}

.form-help {
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}

.info-tip {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.375rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 0.75rem;
  line-height: 1.45;
}

.tip-icon {
  flex-shrink: 0;
  margin-top: 0.05rem;
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

.spin-anim {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
