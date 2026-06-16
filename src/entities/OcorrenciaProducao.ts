import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrdemTeste } from './OrdemTeste';
import { Rastreamento } from './Rastreamento';
import { Setor } from './Setor';
import { Usuario } from './Usuario';

export enum TipoOcorrencia {
  GARGALO_MAQUINA    = 'GARGALO_MAQUINA',    // Problemas mecânicos ou operacionais em máquinas
  FALTA_MATERIAL     = 'FALTA_MATERIAL',     // Falta de suprimentos
  PROBLEMA_QUALIDADE = 'PROBLEMA_QUALIDADE', // Defeito detectado pelo operador antes da inspeção
  BLOQUEIO_PROCESSO  = 'BLOQUEIO_PROCESSO',  // Impedimentos externos
  ACIDENTE_TRABALHO  = 'ACIDENTE_TRABALHO',  // Segurança do trabalho
  OUTRO              = 'OUTRO',
}

export enum GravidadeOcorrencia {
  BAIXA   = 'BAIXA',   // Não interrompe o avanço
  MEDIA   = 'MEDIA',   // Causa lentidão parcial
  ALTA    = 'ALTA',    // Para o setor específico
  CRITICA = 'CRITICA', // Paralisa toda a ordem de teste
}

export enum StatusOcorrencia {
  ABERTA     = 'ABERTA',
  EM_ANALISE = 'EM_ANALISE',
  RESOLVIDA  = 'RESOLVIDA',
  CANCELADA  = 'CANCELADA',
}

@Entity({ name: 'ocorrencias_producao' })
export class OcorrenciaProducao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste afetada
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Rastreamento correspondente (opcional, nulo se apontado a nível geral do setor)
  @ManyToOne(() => Rastreamento, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rastreamento_id' })
  rastreamento: Rastreamento | null;

  @Column({ name: 'rastreamento_id', type: 'uuid', nullable: true })
  rastreamentoId: string | null;

  // Setor produtivo onde ocorreu o gargalo
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  // Operador que registrou o gargalo
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reportado_por_id' })
  reportadoPor: Usuario;

  @Column({ name: 'reportado_por_id', type: 'uuid' })
  reportadoPorId: string;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ name: 'tipo_ocorrencia', type: 'enum', enum: TipoOcorrencia })
  tipoOcorrencia: TipoOcorrencia;

  @Column({ type: 'enum', enum: GravidadeOcorrencia })
  gravidade: GravidadeOcorrencia;

  @Column({ type: 'enum', enum: StatusOcorrencia, default: StatusOcorrencia.ABERTA })
  status: StatusOcorrencia;

  // Flag crítica: se true, o cálculo de SLA do setor deve desconsiderar este tempo de inatividade
  @Column({ name: 'interrompe_sla', type: 'boolean', default: false })
  interrompeSla: boolean;

  @Column({ name: 'data_ocorrencia', type: 'timestamp' })
  dataOcorrencia: Date;

  @Column({ name: 'data_resolucao', type: 'timestamp', nullable: true })
  dataResolucao: Date | null;

  // Colaborador que resolveu o gargalo
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolvido_por_id' })
  resolvidoPor: Usuario | null;

  @Column({ name: 'resolvido_por_id', type: 'uuid', nullable: true })
  resolvidoPorId: string | null;

  @Column({ name: 'resolucao_descricao', type: 'text', nullable: true })
  resolucaoDescricao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
