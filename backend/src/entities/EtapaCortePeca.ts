import {
  Entity,
  PrimaryColumn,
  BeforeInsert,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ResultadoConformidade } from './EtapaCorte';
import type { EtapaCorte } from './EtapaCorte';
import { Peca } from './Peca';
import { uuidv7 } from 'uuidv7';

@Entity({ name: 'etapa_corte_pecas' })
export class EtapaCortePeca {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Registro de fechamento de lote da máquina de corte
  @ManyToOne('EtapaCorte', 'pecasAvaliadas', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etapa_corte_id' })
  etapaCorte: EtapaCorte;

  @Column({ name: 'etapa_corte_id', type: 'uuid' })
  etapaCorteId: string;

  // Peça específica do modelo avaliada durante o fechamento
  @ManyToOne(() => Peca, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'peca_id' })
  peca: Peca;

  @Column({ name: 'peca_id', type: 'uuid' })
  pecaId: string;

  // Resultado de conformidade individual da peça (OK | NAO_OK)
  @Column({ name: 'resultado_conformidade', type: 'enum', enum: ResultadoConformidade })
  resultadoConformidade: ResultadoConformidade;

  // Justificativa / Observação técnica obrigatória quando resultado_conformidade = NAO_OK
  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
