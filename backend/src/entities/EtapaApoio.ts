import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Rastreamento } from './Rastreamento';
import { Usuario } from './Usuario';

export enum EtapaApoioTipo {
  CORTE_APOIO             = 'CORTE_APOIO',
  CHANFRACAO              = 'CHANFRACAO',
  ETIQUETA                = 'ETIQUETA',
  PRENSAGEM               = 'PRENSAGEM',
  FUSE                    = 'FUSE',
  FREQUENCIA              = 'FREQUENCIA',
  TESTE_LABORATORIO_APOIO = 'TESTE_LABORATORIO_APOIO', // Teste laboratorial do micro-fluxo
  RECORTE                 = 'RECORTE',
}

export enum EtapaApoioStatus {
  PENDENTE    = 'PENDENTE',
  EM_PROCESSO = 'EM_PROCESSO',
  CONCLUIDO   = 'CONCLUIDO',
  REPROVADO   = 'REPROVADO', // Reprovação no Lab do Apoio gera retrabalho cirúrgico
}

@Entity({ name: 'etapas_apoio' })
export class EtapaApoio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rastreamento associado ao setor APOIO
  @ManyToOne(() => Rastreamento, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rastreamento_id' })
  rastreamento: Rastreamento;

  @Column({ name: 'rastreamento_id', type: 'uuid' })
  rastreamentoId: string;

  @Column({ type: 'enum', enum: EtapaApoioTipo })
  etapa: EtapaApoioTipo;

  // Operador responsável pela execução da etapa do apoio
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operador_id' })
  operador: Usuario | null;

  @Column({ name: 'operador_id', type: 'uuid', nullable: true })
  operadorId: string | null;

  @Column({ name: 'data_inicio', type: 'timestamp', nullable: true })
  dataInicio: Date | null;

  @Column({ name: 'data_fim', type: 'timestamp', nullable: true })
  dataFim: Date | null;

  @Column({ type: 'enum', enum: EtapaApoioStatus, default: EtapaApoioStatus.PENDENTE })
  status: EtapaApoioStatus;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
