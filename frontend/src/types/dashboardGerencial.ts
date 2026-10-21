export interface LeadTimeItem {
  codigoBarras: string
  tipoLote: string
  leadTimeHoras: number
  modelo: string
  marca: string
  dataInicio: string
}

export interface KpiAData {
  totalOrdensAtivas: number
  mediaCaixaTeste: number
  mediaLotePrincipal: number
  grafico: LeadTimeItem[]
}

export interface GargaloItem {
  id: string
  titulo: string
  descricao: string
  tipoOcorrencia: string
  gravidade: string
  status: string
  dataOcorrencia: string
  setorId: string
  setor: string
  plantaId: string | null
  planta: string
  reportadoPor: string
  totalFotos: number
  fotos: string[]
}

export interface FpySetor {
  setorId: string
  setor: string
  plantaId: string
  planta: string
  totalInspecoes: number
  aprovadasPrimeira: number
  fpyPercentual: number
}

export interface KpiCData {
  fpyGlobal: number | null
  totalInspecoes: number
  setores: FpySetor[]
}

export interface RetrabalhoSetor {
  setorId: string
  setorOrigem: string
  plantaId: string
  planta: string
  totalRetrabalhos: number
  tempoMedioMin: number | null
  tiposDivergencia: string
  percentualDoTotal: number
}

export interface KpiDData {
  totalRetrabalhos: number
  setores: RetrabalhoSetor[]
}

export interface DashboardPlantaOption {
  id: string
  nome: string
  ativo: boolean
}

export interface DashboardSetorOption {
  id: string
  nome: string
  plantaId: string
  planta: string
  ativo: boolean
}

export interface DashboardFilterOptions {
  acessoTodasPlantas: boolean
  plantaId: string | null
  plantas: DashboardPlantaOption[]
  setores: DashboardSetorOption[]
}
