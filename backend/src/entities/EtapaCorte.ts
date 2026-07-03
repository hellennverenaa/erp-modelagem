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
import { EstacaoTrabalho } from './EstacaoTrabalho';
import { Usuario } from './Usuario';

export enum EtapaCorteTipo {
  REVISAO_MAQUINA = 'REVISAO_MAQUINA', // Primeiro bip (efetuado pela Revisora)
  FECHAMENTO_LOTE = 'FECHAMENTO_LOTE', // Segundo bip (efetuado pelo Coordenador do Setor)
}

export enum ResultadoConformidade {
  OK     = 'OK',
  NAO_OK = 'NAO_OK',
}

@Entity({ name: 'etapas_corte' })
export class EtapaCorte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rastreamento correspondente ao subsetor do corte
  @ManyToOne(() => Rastreamento, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rastreamento_id' })
  rastreamento: Rastreamento;

  @Column({ name: 'rastreamento_id', type: 'uuid' })
  rastreamentoId: string;

  // Estação de trabalho/máquina de corte física utilizada
  @ManyToOne(() => EstacaoTrabalho, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'estacao_id' })
  estacao: EstacaoTrabalho;

  @Column({ name: 'estacao_id', type: 'uuid' })
  estacaoId: string;

  @Column({ type: 'enum', enum: EtapaCorteTipo })
  etapa: EtapaCorteTipo;

  // Colaborador responsável pelo bip da etapa do corte
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'operador_id' })
  operador: Usuario;

  @Column({ name: 'operador_id', type: 'uuid' })
  operadorId: string;

  @Column({ name: 'data_bip', type: 'timestamp' })
  dataBip: Date;

  // Check binário de conformidade do fechamento de lote
  @Column({ name: 'resultado_conformidade', type: 'enum', enum: ResultadoConformidade, nullable: true })
  resultadoConformidade: ResultadoConformidade | null;

  // Justificativa obrigatória caso resultado_conformidade seja NAO_OK
  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
