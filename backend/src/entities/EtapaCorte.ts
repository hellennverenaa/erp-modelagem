import {
  Entity,
  PrimaryColumn,
  BeforeInsert,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Rastreamento } from './Rastreamento';
import { EstacaoTrabalho } from './EstacaoTrabalho';
import { Usuario } from './Usuario';
import { EtapaCortePeca } from './EtapaCortePeca';
import { uuidv7 } from 'uuidv7';

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
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

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

  // Avaliação individual por peça (v5.1 - Fechamento Peça a Peça)
  @OneToMany('EtapaCortePeca', 'etapaCorte')
  pecasAvaliadas: EtapaCortePeca[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
