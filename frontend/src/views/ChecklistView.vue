<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api/axios'
import { authStore } from '../api/auth.store'
import {
  Plus,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ClipboardList
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()

const ordemTesteId = route.params.ordemTesteId as string
const setorId = route.params.setorId as string

// Dados do Usuário & Perfil
const user = computed(() => authStore.user.value)
const isAdmin = computed(() => authStore.isAdmin.value)

// Trava de Contexto de Setor (Primeira Camada)
function validarAcessoSetor() {
  if (!user.value) {
    router.push({ name: 'login' })
    return
  }
  if (!isAdmin.value && user.value.setorId !== setorId) {
    console.warn(`[ChecklistSecurity] Acesso negado. Setor logado (${user.value.setorId}) diferente do setor da URL (${setorId})`)
    router.push({ name: 'acesso-negado' })
  }
}

// Segunda Camada: Privilégio de Itens Avulsos
const podeAdicionarItemAvulso = computed(() => {
  if (!user.value) return false
  const perfil = user.value.perfilNome?.toUpperCase() || ''
  return ['ADMIN', 'MODELISTA', 'GERENTE_MODELAGEM', 'ASSISTENTE_MODELAGEM'].includes(perfil)
})

// Estados da UI
const loading = ref(false)
const salvando = ref(false)
const erroMsg = ref('')
const sucessoMsg = ref('')

// Dados do Lote e Rota
const lote = ref<any>(null)
const setor = ref<any>(null)
const template = ref<any>(null)

// Itens e respostas
const itensEstaticos = ref<any[]>([])
const itensAvulsos = ref<any[]>([])

const bloqueante = ref(false)
const observacoesGerais = ref('')

async function carregarDados() {
  loading.value = true
  erroMsg.value = ''
  try {
    // 1. Busca setores para encontrar os dados do setor atual
    const resSetores = await api.get('/admin/setores')
    const setoresList = resSetores.data || []
    setor.value = setoresList.find((s: any) => s.id === setorId)
    
    if (!setor.value) {
      erroMsg.value = 'Setor operacional invalido ou nao localizado.'
      loading.value = false
      return
    }

    // 2. Busca lotes para encontrar os dados da Ordem de Teste
    const resLotes = await api.get('/lotes')
    const lotesList = resLotes.data || []
    lote.value = lotesList.find((l: any) => l.id === ordemTesteId)

    if (!lote.value) {
      erroMsg.value = 'Ordem de teste nao localizada no sistema.'
      loading.value = false
      return
    }

    // 3. Busca templates de checklist da API
    const resTemplates = await api.get('/checklists/templates')
    const templatesList = resTemplates.data || []
    
    // Filtra o template que corresponde ao tipoOpcaoId do setor atual
    template.value = templatesList.find(
      (t: any) => t.setorTipoOpcaoId === setor.value.tipoOpcaoId
    )

    if (!template.value) {
      // Se nao houver template cadastrado no banco, usamos um fallback generico
      template.value = {
        id: '00000000-0000-0000-0000-000000000000',
        nome: `Checklist - ${setor.value.nome}`,
        itens: []
      }
    }

    // Inicializa os itens estáticos com conformidade marcada como true
    itensEstaticos.value = (template.value.itens || []).map((it: any) => ({
      id: it.id,
      descricao: it.descricao,
      conforme: true,
      valorResposta: '',
      observacao: ''
    }))

  } catch (err: any) {
    console.error('[ChecklistView] Erro ao carregar dados:', err)
    erroMsg.value = 'Falha ao buscar as configuracoes do checklist no servidor.'
  } finally {
    loading.value = false
  }
}

function adicionarItemAvulso() {
  itensAvulsos.value.push({
    descricaoAvulsa: '',
    conforme: true,
    valorResposta: '',
    observacao: ''
  })
}

function removerItemAvulso(index: number) {
  itensAvulsos.value.splice(index, 1)
}

async function finalizarChecklist() {
  erroMsg.value = ''
  sucessoMsg.value = ''

  // Validação básica de itens avulsos
  for (const avulso of itensAvulsos.value) {
    if (!avulso.descricaoAvulsa.trim()) {
      erroMsg.value = 'Todos os itens avulsos criados devem ter uma descricao preenchida.'
      return
    }
  }

  salvando.value = true

  try {
    // 1. Monta as respostas
    const respostasPayload = [
      ...itensEstaticos.value.map(it => ({
        templateItemId: it.id,
        conforme: it.conforme,
        valorResposta: it.valorResposta || null,
        observacao: it.observacao || null
      })),
      ...itensAvulsos.value.map(it => ({
        descricaoAvulsa: it.descricaoAvulsa,
        conforme: it.conforme,
        valorResposta: it.valorResposta || null,
        observacao: it.observacao || null
      }))
    ]

    // 2. Faz o POST para salvar as respostas do checklist
    const checklistRes = await api.post('/checklists/responder', {
      ordemTesteId,
      templateId: template.value.id,
      setorId,
      bloqueante: bloqueante.value,
      observacoes: observacoesGerais.value || null,
      respostas: respostasPayload
    })

    if (checklistRes.status !== 201) {
      throw new Error('Falha ao registrar respostas do checklist.')
    }

    // 3. Executa a bipagem de saída física do setor de forma integrada e transparente
    const bipagemRes = await api.post('/rastreamentos/bipar-saida', {
      ordemTesteId,
      setorId,
      tipoLote: 'LOTE_PRINCIPAL'
    })

    if (bipagemRes.status === 200) {
      sucessoMsg.value = 'Checklist salvo e bipagem de saida concluida com sucesso.'
      
      // Toca som de sucesso e redireciona após um pequeno delay
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioCtx.createOscillator()
        const gainNode = audioCtx.createGain()
        oscillator.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime)
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime)
        oscillator.type = 'sine'
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 0.15)
      } catch (e) {}

      setTimeout(() => {
        router.push({ name: 'bipagem' })
      }, 1500)
    } else {
      erroMsg.value = 'Checklist salvo, porem ocorreu uma falha ao registrar a bipagem de saida.'
    }

  } catch (err: any) {
    console.error('[ChecklistView.finalizar] Erro:', err)
    const backendError = err.response?.data?.error || err.message || 'Erro de comunicacao com o servidor.'
    erroMsg.value = `Falha operacional: ${backendError}`
  } finally {
    salvando.value = false
  }
}

onMounted(() => {
  validarAcessoSetor()
  carregarDados()
})
</script>

<template>
  <div class="ck-root">
    <!-- Header -->
    <header class="ck-header">
      <button class="btn-back" @click="router.push({ name: 'bipagem' })" type="button">
        <ChevronLeft :size="16" />
        <span>Voltar</span>
      </button>
      <div class="ck-header-title">
        <ClipboardList :size="18" />
        <span>Controle de Qualidade — Checklist de Processo</span>
      </div>
    </header>

    <main class="ck-container">
      <!-- Loading State -->
      <div v-if="loading" class="ck-loading-box">
        <Loader2 class="ck-spinner" :size="28" />
        <span>Carregando configuracoes do checklist...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="erroMsg && !lote" class="ck-error-box">
        <AlertTriangle :size="24" />
        <span>{{ erroMsg }}</span>
        <button class="btn-retry" @click="carregarDados" type="button">Tentar Novamente</button>
      </div>

      <!-- Main Layout -->
      <div v-else class="ck-grid">
        <!-- Resumo da OP -->
        <section class="ck-summary-card">
          <h2 class="ck-card-title">Identificacao da Ordem de Teste</h2>
          <div class="ck-summary-grid">
            <div class="ck-summary-item">
              <span class="ck-summary-label">Codigo de Barras</span>
              <span class="ck-summary-val font-mono">{{ lote?.codigoBarras || 'N/A' }}</span>
            </div>
            <div class="ck-summary-item">
              <span class="ck-summary-label">Modelo</span>
              <span class="ck-summary-val">{{ lote?.modelo?.nome || 'N/A' }} ({{ lote?.modelo?.codigoProduto || 'N/A' }})</span>
            </div>
            <div class="ck-summary-item">
              <span class="ck-summary-label">Setor de Operacao</span>
              <span class="ck-summary-val">{{ setor?.nome || 'N/A' }}</span>
            </div>
            <div class="ck-summary-item">
              <span class="ck-summary-label">Operador Responsavel</span>
              <span class="ck-summary-val">{{ user?.nomeCompleto || 'N/A' }}</span>
            </div>
          </div>
        </section>

        <!-- Formulario Checklist -->
        <form @submit.prevent="finalizarChecklist" class="ck-form">
          <div class="ck-card">
            <div class="ck-card-header">
              <h2 class="ck-card-title">{{ template?.nome || 'Itens de Verificacao' }}</h2>
              <span class="ck-card-subtitle">Confirme a conformidade de cada requisito obrigatorio</span>
            </div>

            <!-- Toast Messages -->
            <div v-if="erroMsg" class="ck-banner ck-banner--error" role="alert">
              <AlertTriangle :size="18" />
              <span>{{ erroMsg }}</span>
            </div>
            <div v-if="sucessoMsg" class="ck-banner ck-banner--success" role="alert">
              <Check :size="18" />
              <span>{{ sucessoMsg }}</span>
            </div>

            <!-- Lista de Itens Estáticos -->
            <div class="ck-items-list">
              <div v-for="(it, idx) in itensEstaticos" :key="it.id" class="ck-item-row">
                <div class="ck-item-main">
                  <span class="ck-item-num">{{ idx + 1 }}</span>
                  <div class="ck-item-content">
                    <span class="ck-item-desc">{{ it.descricao }}</span>
                    
                    <div class="ck-inputs-row">
                      <div class="ck-input-group">
                        <label :for="`est-val-${it.id}`" class="ck-input-label">Valor/Medida</label>
                        <input
                          :id="`est-val-${it.id}`"
                          v-model="it.valorResposta"
                          type="text"
                          class="ck-field-input"
                          placeholder="Ex: Conforme, 12mm..."
                        />
                      </div>
                      <div class="ck-input-group">
                        <label :for="`est-obs-${it.id}`" class="ck-input-label">Observacao</label>
                        <input
                          :id="`est-obs-${it.id}`"
                          v-model="it.observacao"
                          type="text"
                          class="ck-field-input"
                          placeholder="Observacao do desvio se houver"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Toggle Conformidade -->
                <div class="ck-conformity-box">
                  <button
                    type="button"
                    class="btn-conf"
                    :class="{ 'btn-conf--on': it.conforme }"
                    @click="it.conforme = true"
                    aria-label="Item Conforme"
                  >
                    <Check :size="16" />
                    <span>OK</span>
                  </button>
                  <button
                    type="button"
                    class="btn-conf btn-conf--nok"
                    :class="{ 'btn-conf--nok-on': !it.conforme }"
                    @click="it.conforme = false"
                    aria-label="Item Nao Conforme"
                  >
                    <X :size="16" />
                    <span>N/OK</span>
                  </button>
                </div>
              </div>

              <!-- Lista de Itens Avulsos -->
              <div v-for="(it, idx) in itensAvulsos" :key="idx" class="ck-item-row ck-item-row--avulso">
                <div class="ck-item-main">
                  <span class="ck-item-num ck-item-num--avulso">A</span>
                  <div class="ck-item-content">
                    <div class="ck-input-group">
                      <label :for="`av-desc-${idx}`" class="ck-input-label">Requisito Avulso *</label>
                      <input
                        :id="`av-desc-${idx}`"
                        v-model="it.descricaoAvulsa"
                        type="text"
                        class="ck-field-input font-bold"
                        placeholder="Ex: Verificar espessura do couro..."
                        required
                      />
                    </div>
                    
                    <div class="ck-inputs-row">
                      <div class="ck-input-group">
                        <label :for="`av-val-${idx}`" class="ck-input-label">Valor/Medida</label>
                        <input
                          :id="`av-val-${idx}`"
                          v-model="it.valorResposta"
                          type="text"
                          class="ck-field-input"
                          placeholder="Valor de medicao"
                        />
                      </div>
                      <div class="ck-input-group">
                        <label :for="`av-obs-${idx}`" class="ck-input-label">Observacao</label>
                        <input
                          :id="`av-obs-${idx}`"
                          v-model="it.observacao"
                          type="text"
                          class="ck-field-input"
                          placeholder="Observacoes adicionais"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Ações do Item Avulso -->
                <div class="ck-avulso-actions">
                  <div class="ck-conformity-box">
                    <button
                      type="button"
                      class="btn-conf"
                      :class="{ 'btn-conf--on': it.conforme }"
                      @click="it.conforme = true"
                      aria-label="Item Conforme"
                    >
                      <Check :size="16" />
                      <span>OK</span>
                    </button>
                    <button
                      type="button"
                      class="btn-conf btn-conf--nok"
                      :class="{ 'btn-conf--nok-on': !it.conforme }"
                      @click="it.conforme = false"
                      aria-label="Item Nao Conforme"
                    >
                      <X :size="16" />
                      <span>N/OK</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    class="btn-remove-avulso"
                    @click="removerItemAvulso(idx)"
                    aria-label="Remover Requisito Avulso"
                  >
                    <span>Excluir</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Adicionar Item Avulso (Segunda Camada de Proteção) -->
            <div v-if="podeAdicionarItemAvulso" class="ck-avulso-footer">
              <button
                type="button"
                class="btn-add-avulso"
                @click="adicionarItemAvulso"
              >
                <Plus :size="16" />
                <span>Adicionar Requisito Avulso</span>
              </button>
            </div>
          </div>

          <!-- Rodapé do Checklist -->
          <div class="ck-footer-card">
            <div class="ck-field-group">
              <label for="obs-gerais" class="field-label-text">Observacoes Gerais da Fase</label>
              <textarea
                id="obs-gerais"
                v-model="observacoesGerais"
                class="ck-textarea"
                placeholder="Insira detalhes adicionais sobre desvios, ajustes de maquina ou observacoes de qualidade observadas nesta conferencia."
              ></textarea>
            </div>

            <div class="ck-action-bar">
              <!-- Trava de Bloqueio da OP -->
              <div class="ck-lock-toggle">
                <input
                  id="toggle-bloqueante"
                  v-model="bloqueante"
                  type="checkbox"
                  class="ck-checkbox"
                />
                <label for="toggle-bloqueante" class="ck-checkbox-label">
                  <strong>Marcar Pendencia como Bloqueante</strong>
                  <span class="ck-lock-hint">Bloqueia a entrada desta OP nos setores seguintes se houver inconformidades</span>
                </label>
              </div>

              <!-- Ações de Envio -->
              <div class="ck-action-btns">
                <button
                  type="button"
                  class="btn-cancel-ck"
                  @click="router.push({ name: 'bipagem' })"
                  :disabled="salvando"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  class="btn-submit-ck"
                  :disabled="salvando"
                >
                  <Loader2 v-if="salvando" class="ck-spinner" :size="16" />
                  <span>{{ salvando ? 'Processando...' : 'Finalizar Checklist e Bipar Saída' }}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  </div>
</template>

<style scoped>
.ck-root {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.ck-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  font-family: inherit;
  color: #334155;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-back:hover {
  background: #f1f5f9;
}

.ck-header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f172a;
}

.ck-container {
  flex: 1;
  max-width: 56rem;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ck-loading-box, .ck-error-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 4rem 2rem;
  text-align: center;
  color: #64748b;
}

.ck-spinner {
  animation: spin 0.8s linear infinite;
  color: #1e40af;
}

@keyframes spin { to { transform: rotate(360deg); } }

.btn-retry {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #ffffff;
  background: #1e40af;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  margin-top: 0.5rem;
}

.ck-grid {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Card Resumo */
.ck-summary-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.ck-card-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 1rem 0;
}

.ck-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.ck-summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ck-summary-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ck-summary-val {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
}

/* Card Form */
.ck-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  margin-bottom: 1.25rem;
}

.ck-card-header {
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  background: #fafafa;
}

.ck-card-subtitle {
  font-size: 0.75rem;
  color: #64748b;
}

.ck-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.ck-banner--error {
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #b91c1c;
}

.ck-banner--success {
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  color: #166534;
}

.ck-items-list {
  display: flex;
  flex-direction: column;
}

.ck-item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.ck-item-row--avulso {
  background: #faf5ff;
  border-left: 3px solid #c084fc;
}

.ck-item-main {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex: 1;
}

.ck-item-num {
  width: 1.5rem;
  height: 1.5rem;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ck-item-num--avulso {
  background: #f3e8ff;
  color: #7e22ce;
}

.ck-item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ck-item-desc {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.4;
}

.ck-inputs-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 0.75rem;
}

.ck-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ck-input-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
}

.ck-field-input {
  padding: 0.4375rem 0.625rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  outline: none;
}

.ck-field-input:focus {
  border-color: #1e40af;
}

.ck-textarea {
  width: 100%;
  min-height: 5rem;
  padding: 0.625rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  outline: none;
  resize: vertical;
}

.ck-textarea:focus {
  border-color: #1e40af;
}

.ck-conformity-box {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  overflow: hidden;
  flex-shrink: 0;
}

.btn-conf {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
  background: #ffffff;
  color: #64748b;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-conf--on {
  background: #22c55e;
  color: #ffffff;
}

.btn-conf--nok-on {
  background: #ef4444;
  color: #ffffff;
}

.btn-remove-avulso {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #ef4444;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: right;
}

.ck-avulso-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.ck-avulso-footer {
  padding: 1.25rem;
  background: #fafafa;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
}

.btn-add-avulso {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  font-family: inherit;
  color: #7e22ce;
  background: #f3e8ff;
  border: 1px solid #d8b4fe;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-add-avulso:hover {
  background: #e9d5ff;
}

/* Footer Card */
.ck-footer-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ck-field-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label-text {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
}

.ck-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 1.25rem;
}

.ck-lock-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.ck-checkbox {
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  cursor: pointer;
}

.ck-checkbox-label {
  display: flex;
  flex-direction: column;
  font-size: 0.8125rem;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.ck-lock-hint {
  font-size: 0.6875rem;
  color: #64748b;
}

.ck-action-btns {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-cancel-ck {
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  color: #475569;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-cancel-ck:hover {
  background: #f8fafc;
}

.btn-submit-ck {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  font-family: inherit;
  color: #ffffff;
  background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-submit-ck:hover {
  opacity: 0.9;
}

.btn-submit-ck:disabled, .btn-cancel-ck:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
