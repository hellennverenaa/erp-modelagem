import { ref, type Ref } from 'vue'
import api from './axios'

// ─── Interfaces de Metadados e Configuração ─────────────────────────────
export interface Planta {
  id: string
  nome: string
  codigo?: string | null
  cidade?: string | null
  estado?: string | null
  ativo?: boolean
}

export interface Marca {
  id: string
  nome: string
  ativo?: boolean
}

export interface RotaModeloItem {
  id: string
  ordem: number
  obrigatorio: boolean
  slaAlvoMin?: number | null
  setor: {
    id: string
    nome: string
  }
}

export interface PecaInfo {
  id: string
  nome: string
  codigoBarras: string | null
  descricao: string | null
  setorCorteOpcaoId: string
}

export interface Modelo {
  id: string
  nome: string
  codigoProduto: string
  versao?: number
  ativo?: boolean
  dataCorte?: string | null
  marcaId?: string
  marca?: { id: string; nome: string }
  plantaId?: string
  planta?: Planta
  pecas?: PecaInfo[]
  rotas?: RotaModeloItem[]
  slasPorSetor?: Record<string, number> | null
}

export interface Setor {
  id: string
  nome: string
  tipo?: string
  plantaId?: string
  ativo?: boolean
}

export interface ConfigOpcao {
  id: string
  categoria?: string
  valor: string
  label: string
  ativo?: boolean
}

// ─── Configurações de Cache ─────────────────────────────────────────────
const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutos de cache em memória

interface CacheItem<T> {
  data: Ref<T[]>
  lastFetched: number
  inFlight: Promise<T[]> | null
}

function createCacheSlot<T>(): CacheItem<T> {
  return {
    data: ref([]) as Ref<T[]>,
    lastFetched: 0,
    inFlight: null,
  }
}

const cache = {
  plantas: createCacheSlot<Planta>(),
  marcas: createCacheSlot<Marca>(),
  modelos: createCacheSlot<Modelo>(),
  catalogoModelos: createCacheSlot<Modelo>(),
  setores: createCacheSlot<Setor>(),
  maquinasCorte: createCacheSlot<ConfigOpcao>(),
}

// ─── Executor de Requisição com Cache e Deduplicação In-Flight ───────────
async function executeWithCache<T>(
  slot: CacheItem<T>,
  fetchFn: () => Promise<T[]>,
  forceRefresh = false,
  ttlMs = DEFAULT_TTL_MS
): Promise<T[]> {
  const currentData = slot.data.value || []
  const isFresh = currentData.length > 0 && Date.now() - slot.lastFetched < ttlMs
  if (!forceRefresh && isFresh) {
    return currentData
  }

  // Deduplicação: se já existe uma chamada idêntica em trânsito, compartilha a mesma Promise
  if (slot.inFlight) {
    return slot.inFlight
  }

  slot.inFlight = (async () => {
    try {
      const result = await fetchFn()
      slot.data.value = Array.isArray(result) ? result : []
      slot.lastFetched = Date.now()
      return slot.data.value
    } finally {
      slot.inFlight = null
    }
  })()

  return slot.inFlight
}

// ─── Getters Reativos com Cache ─────────────────────────────────────────

async function getPlantas(force = false): Promise<Planta[]> {
  return executeWithCache(cache.plantas, async () => {
    const { data } = await api.get<Planta[]>('/admin/plantas')
    return data || []
  }, force)
}

async function getMarcas(force = false): Promise<Marca[]> {
  return executeWithCache(cache.marcas, async () => {
    const { data } = await api.get<Marca[]>('/admin/marcas')
    return data || []
  }, force)
}

async function getModelos(force = false): Promise<Modelo[]> {
  return executeWithCache(cache.modelos, async () => {
    const { data } = await api.get<Modelo[]>('/admin/modelos')
    return data || []
  }, force)
}

async function getCatalogoModelos(force = false): Promise<Modelo[]> {
  return executeWithCache(cache.catalogoModelos, async () => {
    const { data } = await api.get<Modelo[]>('/admin/modelos/catalogo')
    return data || []
  }, force)
}

async function getSetores(force = false): Promise<Setor[]> {
  return executeWithCache(cache.setores, async () => {
    const { data } = await api.get<Setor[]>('/admin/setores')
    return data || []
  }, force)
}

async function getMaquinasCorte(force = false): Promise<ConfigOpcao[]> {
  return executeWithCache(cache.maquinasCorte, async () => {
    try {
      const { data } = await api.get<any[]>('/config/opcoes/subsetor_corte')
      return (data || []).map((m: any) => ({
        id: m.id,
        valor: m.valor,
        label: m.label || m.valor,
        ativo: m.ativo,
      }))
    } catch {
      const { data } = await api.get<any[]>('/admin/config-opcoes', {
        params: { categoria: 'subsetor_corte' },
      })
      return (data || []).map((m: any) => ({
        id: m.id,
        valor: m.valor,
        label: m.label || m.valor,
        ativo: m.ativo,
      }))
    }
  }, force)
}

// ─── Invalidações Atômicas e de Sessão ───────────────────────────────────

function invalidateSlot<T>(slot: CacheItem<T>, clearData = false) {
  slot.lastFetched = 0
  slot.inFlight = null
  if (clearData) {
    slot.data.value = []
  }
}

function invalidatePlantas(clearData = false) {
  invalidateSlot(cache.plantas, clearData)
}

function invalidateMarcas(clearData = false) {
  invalidateSlot(cache.marcas, clearData)
}

function invalidateModelos(clearData = false) {
  invalidateSlot(cache.modelos, clearData)
  invalidateSlot(cache.catalogoModelos, clearData)
}

function invalidateSetores(clearData = false) {
  invalidateSlot(cache.setores, clearData)
}

function invalidateMaquinasCorte(clearData = false) {
  invalidateSlot(cache.maquinasCorte, clearData)
}

function invalidateAll(clearData = false) {
  invalidatePlantas(clearData)
  invalidateMarcas(clearData)
  invalidateModelos(clearData)
  invalidateSetores(clearData)
  invalidateMaquinasCorte(clearData)
}

// Limpa e invalida caches em caso de encerramento da sessão do usuário
if (typeof window !== 'undefined') {
  window.addEventListener('erp:auth-session-ended', () => {
    invalidateAll(true)
  })
}

// ─── Helpers Utilitários de Resolução ───────────────────────────────────

function getModeloNome(modeloId: string): string {
  const mod =
    (cache.catalogoModelos.data.value || []).find((m) => m.id === modeloId) ||
    (cache.modelos.data.value || []).find((m) => m.id === modeloId)
  return mod ? mod.nome : `Modelo #${modeloId.substring(0, 8)}`
}

function getModeloReferencia(modeloId: string): string {
  const mod =
    (cache.catalogoModelos.data.value || []).find((m) => m.id === modeloId) ||
    (cache.modelos.data.value || []).find((m) => m.id === modeloId)
  return mod ? mod.codigoProduto : 'N/A'
}

function getPlantaNome(plantaId: string): string {
  const p = (cache.plantas.data.value || []).find((item) => item.id === plantaId)
  return p ? p.nome : `Planta #${plantaId.substring(0, 8)}`
}

function getMarcaNome(marcaId: string): string {
  const m = (cache.marcas.data.value || []).find((item) => item.id === marcaId)
  return m ? m.nome : `Marca #${marcaId.substring(0, 8)}`
}

// ─── Exportação do Store Singleton ──────────────────────────────────────
export const configStore = {
  // Estado reativo direto (readonly view)
  plantas: cache.plantas.data,
  marcas: cache.marcas.data,
  modelos: cache.modelos.data,
  catalogoModelos: cache.catalogoModelos.data,
  setores: cache.setores.data,
  maquinasCorte: cache.maquinasCorte.data,

  // Getters com cache e deduplicação
  getPlantas,
  getMarcas,
  getModelos,
  getCatalogoModelos,
  getSetores,
  getMaquinasCorte,

  // Invalidações
  invalidatePlantas,
  invalidateMarcas,
  invalidateModelos,
  invalidateSetores,
  invalidateMaquinasCorte,
  invalidateAll,

  // Helpers
  getModeloNome,
  getModeloReferencia,
  getPlantaNome,
  getMarcaNome,
}
