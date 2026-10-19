export interface PecaInfo {
  id: string
  nome: string
  codigoBarras: string | null
  descricao: string | null
  setorCorteOpcaoId: string
}

export interface MarcaInfo {
  id: string
  nome: string
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

export interface Modelo {
  id: string
  nome: string
  codigoProduto: string
  dataCorte?: string | null
  pecas?: PecaInfo[]
  marca?: MarcaInfo
  rotas?: RotaModeloItem[]
  slasPorSetor?: Record<string, number> | null
}

export interface OrdemTeste {
  id: string
  codigoBarras: string
  modeloId: string
  plantaId: string
  prioridadePcp: string
  status: string
  liberadoProducao: boolean
  possuiCaixaTeste: boolean | null
  observacoes: string | null
  slasPorSetor?: Record<string, number> | null
  pecasRemanejadas?: Record<string, string> | null
  createdAt: string
  updatedAt: string
  modelo?: Modelo
}

export interface Planta {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
}

export interface SetorInfo {
  id: string
  nome: string
  tipoSetor?: string | null
}

export interface OperadorInfo {
  id: string
  nomeCompleto: string
  usuario: string
}

export interface EstacaoInfo {
  id?: string
  nome?: string
  codigo?: string
}

export interface RastreamentoHistorico {
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
  itens?: RastreamentoHistorico[]
}

export interface HistoricoResponse {
  ordemTesteId: string
  total: number
  historico: RastreamentoHistorico[]
}

export interface TicketSetorInfo {
  id: string
  codigoBarras: string
  tipoLote: 'LOTE_PRINCIPAL' | 'CAIXA_TESTE'
  ordemEtapa: number
  rotaVersao: number
  setorNomeSnapshot: string
}

export interface TicketsSetorResponse {
  ordemTesteId: string
  codigoBarras: string
  modeloNome: string
  rotaCongelada?: boolean
  tickets: TicketSetorInfo[]
}

export interface SlaSetorFormItem {
  setorKey: string
  setorNome: string
  valor: number
  unidade: 'min' | 'h' | 'd'
}

export type GrupoImpressaoTickets = 'LOTE_PRINCIPAL' | 'CAIXA_TESTE' | 'CORTE' | 'TODOS'
