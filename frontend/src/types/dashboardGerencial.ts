export interface MotivoParada {
  motivo: string
  minutos: number
  horas: number
  quantidade: number
  percentual: number
}

export interface LeadTimeItem {
  codigoBarras: string
  tipoLote: string
  leadTimeHoras: number
  downtimeHoras: number
  modelo: string
  marca: string
  dataInicio: string
}

export interface KpiAData {
  totalOrdensAtivas: number
  mediaCaixaTeste: number
  mediaLotePrincipal: number
  downtimeTotalMin: number
  downtimeTotalHoras: number
  motivosParada: MotivoParada[]
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
  setor: string
  reportadoPor: string
  totalFotos: number
  fotos: string[]
}

export interface FpySetor {
  setor: string
  totalInspecoes: number
  totalRastreamentos: number
  aprovadasPrimeira: number
  fpyPercentual: number
}

export interface KpiCData {
  fpyGlobal: number | null
  totalInspecoes: number
  setores: FpySetor[]
}

export interface RetrabalhoSetor {
  setorOrigem: string
  totalRetrabalhos: number
  tempoMedioMin: number
  tiposDivergencia: string
  percentualDoTotal: number
}

export interface KpiDData {
  totalRetrabalhos: number
  setores: RetrabalhoSetor[]
}
