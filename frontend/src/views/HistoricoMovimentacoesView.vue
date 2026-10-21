<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, ChevronLeft, ChevronRight, RefreshCw, Search } from '@lucide/vue'
import api from '../api/axios'

type CategoriaHistorico =
  | 'CONFIGURACAO'
  | 'ORDEM'
  | 'BIPAGEM'
  | 'QUALIDADE'
  | 'OCORRENCIA'
  | 'RETRABALHO'
  | 'CHECKLIST'
  | 'CORTE_APOIO'

interface OpcaoHistorico {
  id: string
  nome: string
  plantaId?: string
  ativo?: boolean
}

interface OpcoesFiltro {
  acessoTodasPlantas: boolean
  plantaId: string | null
  plantas: OpcaoHistorico[]
  setores: OpcaoHistorico[]
  categorias: Array<{ chave: CategoriaHistorico; nome: string }>
}

interface EventoHistorico {
  id: string
  dataHora: string
  categoria: CategoriaHistorico
  acao: string
  rotuloAcao: string
  descricao: string
  usuario: { id: string | null; nome: string | null } | null
  responsavel: string | null
  planta: { id: string | null; nome: string | null } | null
  setor: { id: string | null; nome: string | null } | null
  ordem: { id: string | null; codigoBarras: string | null } | null
  entidade: { tipo: string; id: string }
  dadosAnteriores: Record<string, unknown> | null
  dadosNovos: Record<string, unknown> | null
  detalhes: Record<string, unknown> | null
}

const opcoes = ref<OpcoesFiltro>({
  acessoTodasPlantas: false,
  plantaId: null,
  plantas: [],
  setores: [],
  categorias: [],
})
const filtros = ref({
  plantaId: '',
  setorId: '',
  categoria: '' as CategoriaHistorico | '',
  dataInicio: '',
  dataFim: '',
  busca: '',
})
const eventos = ref<EventoHistorico[]>([])
const pagina = ref(1)
const limite = ref(25)
const total = ref(0)
const totalPaginas = ref(0)
const carregandoFiltros = ref(true)
const erroFiltros = ref(false)
const carregando = ref(true)
const erroConsulta = ref(false)

const periodoInvalido = computed(() => Boolean(
  filtros.value.dataInicio && filtros.value.dataFim && filtros.value.dataInicio > filtros.value.dataFim,
))
const setoresVisiveis = computed(() => opcoes.value.setores.filter(
  setor => !filtros.value.plantaId || setor.plantaId === filtros.value.plantaId,
))
const paginaExibida = computed(() => Math.max(totalPaginas.value, 1))
const resumo = computed(() => `${total.value.toLocaleString('pt-BR')} registro${total.value === 1 ? '' : 's'}`)

async function carregarOpcoes() {
  carregandoFiltros.value = true
  erroFiltros.value = false
  try {
    const { data } = await api.get('/historico/filtros', {
      params: opcoes.value.acessoTodasPlantas && filtros.value.plantaId
        ? { plantaId: filtros.value.plantaId }
        : undefined,
    })
    opcoes.value = {
      acessoTodasPlantas: data.acessoTodasPlantas === true,
      plantaId: data.plantaId ?? null,
      plantas: Array.isArray(data.plantas) ? data.plantas : [],
      setores: Array.isArray(data.setores) ? data.setores : [],
      categorias: Array.isArray(data.categorias) ? data.categorias : [],
    }
  } catch {
    erroFiltros.value = true
  } finally {
    carregandoFiltros.value = false
  }
}

async function carregarEventos() {
  if (periodoInvalido.value) return
  carregando.value = true
  erroConsulta.value = false

  const params: Record<string, string | number> = {
    pagina: pagina.value,
    limite: limite.value,
  }
  if (filtros.value.plantaId) params.plantaId = filtros.value.plantaId
  if (filtros.value.setorId) params.setorId = filtros.value.setorId
  if (filtros.value.categoria) params.categoria = filtros.value.categoria
  if (filtros.value.dataInicio) params.dataInicio = filtros.value.dataInicio
  if (filtros.value.dataFim) params.dataFim = filtros.value.dataFim
  if (filtros.value.busca.trim()) params.busca = filtros.value.busca.trim()

  try {
    const { data } = await api.get('/historico/movimentacoes', { params })
    eventos.value = Array.isArray(data.itens) ? data.itens : []
    total.value = Number(data.total) || 0
    totalPaginas.value = Number(data.totalPaginas) || 0
  } catch {
    erroConsulta.value = true
    eventos.value = []
  } finally {
    carregando.value = false
  }
}

async function aplicarFiltros() {
  pagina.value = 1
  await carregarEventos()
}

async function limparFiltros() {
  filtros.value = { plantaId: '', setorId: '', categoria: '', dataInicio: '', dataFim: '', busca: '' }
  pagina.value = 1
  await carregarOpcoes()
  await carregarEventos()
}

async function alterarPlanta() {
  filtros.value.setorId = ''
  pagina.value = 1
  await carregarOpcoes()
  await carregarEventos()
}

async function irParaPagina(novaPagina: number) {
  if (novaPagina < 1 || novaPagina > totalPaginas.value || novaPagina === pagina.value) return
  pagina.value = novaPagina
  await carregarEventos()
}

async function alterarLimite(event: Event) {
  limite.value = Number((event.target as HTMLSelectElement).value) || 25
  pagina.value = 1
  await carregarEventos()
}

function formatarData(valor: string) {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(data)
}

function formatarCategoria(categoria: CategoriaHistorico) {
  return opcoes.value.categorias.find(opcao => opcao.chave === categoria)?.nome ?? categoria
}

function formatarTipoEntidade(tipo: string) {
  const nomes: Record<string, string> = {
    modelos: 'Modelo',
    catalogo_pecas: 'Peça do catálogo',
    ordens_teste: 'Ordem de teste',
    rastreamentos: 'Rastreamento',
    inspecoes: 'Inspeção',
    ocorrencias_producao: 'Ocorrência',
    checklists: 'Checklist',
    validacoes_setor: 'Validação de setor',
    aprovacoes_finais: 'Aprovação final',
    divergencias: 'Divergência',
    retrabalhos: 'Retrabalho',
    etapas_corte: 'Etapa de Corte',
    etapas_apoio: 'Etapa de Apoio',
  }
  return nomes[tipo] ?? tipo.replace(/_/g, ' ')
}

function formatarJson(valor: Record<string, unknown> | null) {
  return valor ? JSON.stringify(valor, null, 2) : ''
}

onMounted(async () => {
  await carregarOpcoes()
  await carregarEventos()
})
</script>

<template>
  <section class="history-page">
    <header class="page-header">
      <div class="header-title-wrap">
        <span class="header-icon" aria-hidden="true"><Activity :size="21" /></span>
        <div>
          <p class="eyebrow">Auditoria e produção</p>
          <h1>Histórico de Movimentações</h1>
          <p class="header-subtitle">Alterações de configuração e registros operacionais em uma cronologia.</p>
        </div>
      </div>
      <button class="button button--secondary refresh-button" type="button" :disabled="carregando" @click="carregarEventos">
        <RefreshCw :size="16" :class="{ spinning: carregando }" aria-hidden="true" />
        Atualizar
      </button>
    </header>

    <form class="filter-card" @submit.prevent="aplicarFiltros">
      <div class="filter-heading">
        <div>
          <h2>Filtros</h2>
          <span>{{ resumo }}</span>
        </div>
        <button class="button button--text" type="button" @click="limparFiltros">Limpar filtros</button>
      </div>

      <p v-if="erroFiltros" class="inline-error" role="alert">
        Não foi possível carregar as opções de filtro.
        <button type="button" class="retry-link" @click="carregarOpcoes">Tentar novamente</button>
      </p>

      <div class="filter-grid">
        <label v-if="opcoes.acessoTodasPlantas" class="field field--plant">
          <span>Planta</span>
          <select v-model="filtros.plantaId" :disabled="carregandoFiltros" @change="alterarPlanta">
            <option value="">Todas as plantas</option>
            <option v-for="planta in opcoes.plantas" :key="planta.id" :value="planta.id">
              {{ planta.nome }}{{ planta.ativo === false ? ' (inativa)' : '' }}
            </option>
          </select>
        </label>
        <label class="field field--sector">
          <span>Setor</span>
          <select v-model="filtros.setorId" :disabled="carregandoFiltros || setoresVisiveis.length === 0">
            <option value="">Todos os setores</option>
            <option v-for="setor in setoresVisiveis" :key="setor.id" :value="setor.id">{{ setor.nome }}</option>
          </select>
        </label>
        <label class="field field--category">
          <span>Categoria</span>
          <select v-model="filtros.categoria">
            <option value="">Todas</option>
            <option v-for="categoria in opcoes.categorias" :key="categoria.chave" :value="categoria.chave">
              {{ categoria.nome }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Data inicial</span>
          <input v-model="filtros.dataInicio" type="date">
        </label>
        <label class="field">
          <span>Data final</span>
          <input v-model="filtros.dataFim" type="date">
        </label>
        <label class="field field--search">
          <span>Buscar</span>
          <div class="search-input-wrap">
            <Search :size="16" aria-hidden="true" />
            <input v-model="filtros.busca" type="search" maxlength="100" placeholder="Ordem, pessoa, evento ou setor">
          </div>
        </label>
      </div>

      <div class="filter-footer">
        <p v-if="periodoInvalido" class="validation-error" role="alert">A data inicial precisa ser anterior ou igual à data final.</p>
        <p v-else class="filter-hint">O período inclui as datas inicial e final.</p>
        <button class="button button--primary" type="submit" :disabled="periodoInvalido || carregando">
          Aplicar filtros
        </button>
      </div>
    </form>

    <div v-if="erroConsulta" class="state-card state-card--error" role="alert">
      <div>
        <h2>Não foi possível carregar o histórico</h2>
        <p>Verifique sua conexão e tente novamente.</p>
      </div>
      <button class="button button--secondary" type="button" @click="carregarEventos">Tentar novamente</button>
    </div>

    <div v-else-if="carregando" class="state-card" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <p>Carregando movimentações…</p>
    </div>

    <div v-else-if="eventos.length === 0" class="state-card">
      <span class="empty-icon" aria-hidden="true"><Activity :size="24" /></span>
      <h2>Nenhuma movimentação encontrada</h2>
      <p>Altere os filtros ou tente um período diferente.</p>
    </div>

    <template v-else>
      <ol class="timeline" aria-label="Movimentações em ordem cronológica">
        <li v-for="evento in eventos" :key="evento.id" class="timeline-item">
          <span class="timeline-marker" aria-hidden="true"></span>
          <article class="event-card">
            <div class="event-topline">
              <span class="category-badge" :class="`category-badge--${evento.categoria.toLowerCase()}`">
                {{ formatarCategoria(evento.categoria) }}
              </span>
              <time :datetime="new Date(evento.dataHora).toISOString()">{{ formatarData(evento.dataHora) }}</time>
            </div>
            <div class="event-content">
              <h2>{{ evento.rotuloAcao }}</h2>
              <p class="event-description">{{ evento.descricao }}</p>
            </div>
            <div class="event-meta">
              <span>{{ evento.usuario?.nome || (evento.responsavel ? `Responsável: ${evento.responsavel}` : 'Usuário não identificado') }}</span>
              <span v-if="evento.planta?.nome">{{ evento.planta.nome }}</span>
              <span v-if="evento.setor?.nome">{{ evento.setor.nome }}</span>
              <span v-if="evento.ordem?.codigoBarras">Ordem {{ evento.ordem.codigoBarras }}</span>
              <span>{{ formatarTipoEntidade(evento.entidade.tipo) }}</span>
            </div>
            <details v-if="evento.detalhes || evento.dadosAnteriores || evento.dadosNovos" class="event-details">
              <summary>Ver detalhes do registro</summary>
              <div class="detail-grid">
                <div v-if="evento.dadosAnteriores" class="detail-block">
                  <h3>Antes</h3>
                  <pre>{{ formatarJson(evento.dadosAnteriores) }}</pre>
                </div>
                <div v-if="evento.dadosNovos" class="detail-block">
                  <h3>Depois</h3>
                  <pre>{{ formatarJson(evento.dadosNovos) }}</pre>
                </div>
                <div v-if="evento.detalhes" class="detail-block detail-block--full">
                  <h3>Dados registrados</h3>
                  <pre>{{ formatarJson(evento.detalhes) }}</pre>
                </div>
              </div>
            </details>
          </article>
        </li>
      </ol>

      <footer class="pagination-card">
        <label class="page-size">
          Exibir
          <select :value="limite" @change="alterarLimite">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          por página
        </label>
        <div class="pagination-controls" aria-label="Paginação do histórico">
          <button class="button button--secondary page-button" type="button" :disabled="pagina <= 1 || carregando" aria-label="Página anterior" @click="irParaPagina(pagina - 1)">
            <ChevronLeft :size="17" aria-hidden="true" />
          </button>
          <span>Página <strong>{{ pagina }}</strong> de <strong>{{ paginaExibida }}</strong></span>
          <button class="button button--secondary page-button" type="button" :disabled="pagina >= totalPaginas || carregando" aria-label="Próxima página" @click="irParaPagina(pagina + 1)">
            <ChevronRight :size="17" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.history-page {
  width: min(100%, 88rem);
  margin: 0 auto;
  padding: 1.5rem clamp(1rem, 2vw, 2rem) 2.25rem;
  color: #172033;
}

.page-header,
.header-title-wrap,
.filter-heading,
.filter-footer,
.event-topline,
.event-meta,
.pagination-card,
.pagination-controls {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.header-title-wrap { min-width: 0; gap: 0.85rem; }
.header-icon,
.empty-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: #fff;
  background: #111827;
  border-radius: 0.8rem;
}
.header-icon { width: 2.8rem; height: 2.8rem; }
.eyebrow { margin: 0 0 0.18rem; color: #4f46e5; font-size: 0.69rem; font-weight: 750; letter-spacing: 0.09em; text-transform: uppercase; }
h1 { margin: 0; color: #111827; font-size: clamp(1.35rem, 2.4vw, 1.8rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1.2; }
.header-subtitle { margin: 0.35rem 0 0; color: #718096; font-size: 0.88rem; }

.button {
  display: inline-flex;
  min-height: 2.55rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}
.button:disabled { cursor: not-allowed; opacity: 0.55; }
.button--primary { color: white; background: #172554; }
.button--primary:hover:not(:disabled) { background: #1e40af; }
.button--secondary { color: #334155; background: #fff; border-color: #dbe3ee; }
.button--secondary:hover:not(:disabled) { background: #f8fafc; border-color: #b8c5d6; }
.button--text { min-height: auto; padding: 0.3rem 0; color: #4f46e5; background: transparent; }
.refresh-button { flex: 0 0 auto; }
.spinning { animation: spin 1s linear infinite; }

.filter-card,
.event-card,
.state-card,
.pagination-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.9rem;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.045);
}
.filter-card { margin-bottom: 1.5rem; padding: 1rem 1.1rem 0.95rem; }
.filter-heading { justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; }
.filter-heading > div { display: flex; align-items: baseline; gap: 0.7rem; }
.filter-heading h2 { margin: 0; color: #253149; font-size: 0.9rem; font-weight: 750; }
.filter-heading span { color: #8a97aa; font-size: 0.76rem; }
.filter-grid { display: grid; grid-template-columns: repeat(6, minmax(8rem, 1fr)); gap: 0.7rem; }
.field { display: flex; min-width: 0; flex-direction: column; gap: 0.35rem; }
.field--plant { grid-column: span 1; }
.field--sector { grid-column: span 1; }
.field--category { grid-column: span 1; }
.field--search { grid-column: span 2; }
.field > span { color: #526176; font-size: 0.73rem; font-weight: 700; }
.field select,
.field input,
.search-input-wrap { width: 100%; min-width: 0; height: 2.55rem; color: #263449; background: #fff; border: 1px solid #d8e0eb; border-radius: 0.62rem; font: inherit; font-size: 0.82rem; }
.field select,
.field input { padding: 0 0.7rem; }
.field select:focus,
.field input:focus,
.search-input-wrap:focus-within { outline: 2px solid rgba(79, 70, 229, 0.2); border-color: #818cf8; }
.field select:disabled { color: #94a3b8; background: #f8fafc; }
.search-input-wrap { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.7rem; color: #8491a4; }
.search-input-wrap input { height: 100%; padding: 0; border: 0; outline: 0; }
.filter-footer { justify-content: space-between; gap: 0.8rem; margin-top: 0.85rem; }
.filter-hint,
.validation-error,
.inline-error { margin: 0; color: #8794a7; font-size: 0.75rem; }
.validation-error,
.inline-error { color: #c2414b; }
.inline-error { margin-bottom: 0.75rem; }
.retry-link { padding: 0; color: #b42335; background: none; border: 0; cursor: pointer; font: inherit; font-weight: 700; text-decoration: underline; }

.timeline { position: relative; display: flex; flex-direction: column; gap: 0.8rem; margin: 0; padding: 0 0 0 1.4rem; list-style: none; }
.timeline::before { position: absolute; top: 1rem; bottom: 1rem; left: 0.36rem; width: 2px; background: #dce4f0; content: ''; }
.timeline-item { position: relative; min-width: 0; }
.timeline-marker { position: absolute; top: 1.25rem; left: -1.4rem; width: 0.8rem; height: 0.8rem; background: #4f46e5; border: 3px solid #eef2ff; border-radius: 50%; box-shadow: 0 0 0 1px #c7d2fe; }
.event-card { min-width: 0; padding: 0.95rem 1rem 0.85rem; }
.event-topline { justify-content: space-between; gap: 0.7rem; }
.event-topline time { color: #7b8798; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.category-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.55rem; color: #4338ca; background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 99px; font-size: 0.67rem; font-weight: 750; }
.category-badge--bipagem { color: #0369a1; background: #f0f9ff; border-color: #dbeafe; }
.category-badge--qualidade { color: #047857; background: #ecfdf5; border-color: #d1fae5; }
.category-badge--ocorrencia,
.category-badge--retrabalho { color: #b45309; background: #fffbeb; border-color: #fef3c7; }
.category-badge--corte_apoio { color: #6d28d9; background: #f5f3ff; border-color: #ede9fe; }
.category-badge--checklist { color: #0f766e; background: #f0fdfa; border-color: #ccfbf1; }
.event-content { margin: 0.62rem 0; }
.event-content h2 { margin: 0; color: #172033; font-size: 0.99rem; font-weight: 750; }
.event-description { margin: 0.18rem 0 0; color: #64748b; font-size: 0.83rem; overflow-wrap: anywhere; }
.event-meta { display: flex; flex-wrap: wrap; gap: 0.42rem; }
.event-meta span { padding: 0.24rem 0.5rem; color: #536176; background: #f8fafc; border: 1px solid #edf1f6; border-radius: 99px; font-size: 0.69rem; }
.event-details { margin-top: 0.7rem; padding-top: 0.55rem; border-top: 1px solid #edf1f6; }
.event-details summary { width: fit-content; color: #4f46e5; cursor: pointer; font-size: 0.75rem; font-weight: 700; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; margin-top: 0.6rem; }
.detail-block { min-width: 0; padding: 0.65rem; background: #f8fafc; border: 1px solid #e8edf4; border-radius: 0.6rem; }
.detail-block--full { grid-column: 1 / -1; }
.detail-block h3 { margin: 0 0 0.4rem; color: #475569; font-size: 0.72rem; font-weight: 750; }
.detail-block pre { max-height: 16rem; margin: 0; overflow: auto; color: #334155; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.7rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }

.state-card { display: flex; min-height: 10rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.5rem; text-align: center; }
.state-card--error { flex-direction: row; justify-content: space-between; text-align: left; }
.state-card h2 { margin: 0; color: #253149; font-size: 0.95rem; }
.state-card p { margin: 0; color: #8491a4; font-size: 0.82rem; }
.state-card--error h2 { color: #a52a38; }
.loading-spinner { width: 1.5rem; height: 1.5rem; border: 2px solid #dbe3ee; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.8s linear infinite; }
.empty-icon { width: 2.7rem; height: 2.7rem; margin-bottom: 0.25rem; color: #4f46e5; background: #eef2ff; }

.pagination-card { justify-content: space-between; gap: 1rem; margin-top: 1rem; padding: 0.7rem 0.9rem; }
.page-size { display: inline-flex; align-items: center; gap: 0.4rem; color: #69778a; font-size: 0.76rem; }
.page-size select { height: 2rem; padding: 0 0.4rem; color: #334155; background: #fff; border: 1px solid #d8e0eb; border-radius: 0.45rem; }
.pagination-controls { gap: 0.7rem; color: #69778a; font-size: 0.76rem; }
.page-button { width: 2.2rem; min-height: 2.2rem; padding: 0; }
.pagination-controls strong { color: #253149; }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1080px) {
  .filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .field--search { grid-column: span 2; }
}

@media (max-width: 640px) {
  .history-page { padding: 1rem 0.8rem 1.5rem; }
  .page-header { align-items: flex-start; }
  .header-title-wrap { align-items: flex-start; }
  .header-subtitle { max-width: 35ch; font-size: 0.8rem; }
  .refresh-button { width: 2.6rem; min-width: 2.6rem; padding: 0; overflow: hidden; font-size: 0; gap: 0; }
  .filter-card { padding: 0.85rem; }
  .filter-heading > div { align-items: flex-start; flex-direction: column; gap: 0.15rem; }
  .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .field--plant,
  .field--sector,
  .field--category { grid-column: span 1; }
  .field--search { grid-column: 1 / -1; }
  .filter-footer { align-items: flex-end; }
  .filter-footer .button { flex: 0 0 auto; }
  .timeline { padding-left: 1.1rem; }
  .timeline-marker { left: -1.1rem; }
  .event-card { padding: 0.8rem; }
  .detail-grid { grid-template-columns: 1fr; }
  .detail-block--full { grid-column: auto; }
  .state-card--error { align-items: flex-start; flex-direction: column; }
  .pagination-card { align-items: flex-start; flex-direction: column; }
  .pagination-controls { align-self: flex-end; }
}
</style>
