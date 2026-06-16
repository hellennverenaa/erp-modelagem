import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Inspecao } from './Inspecao';
import { Peca } from './Peca';

@Entity({ name: 'inspecao_pecas' })
export class InspecaoPeca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Inspeção global vinculada
  @ManyToOne(() => Inspecao, (inspecao) => inspecao.inspecaoPecas, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inspecao_id' })
  inspecao: Inspecao;

  @Column({ name: 'inspecao_id', type: 'uuid' })
  inspecaoId: string;

  // Peça física avaliada
  @ManyToOne(() => Peca, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'peca_id' })
  peca: Peca;

  @Column({ name: 'peca_id', type: 'uuid' })
  pecaId: string;

  @Column({ type: 'varchar', length: 50 })
  resultado: string; // Ex: APROVADO, REPROVADO

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
