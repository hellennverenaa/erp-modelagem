import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { OrdemTeste } from './OrdemTeste';
import { Inspecao } from './Inspecao';
import { Peca } from './Peca';
import { Setor } from './Setor';
import { Usuario } from './Usuario';
import { Retrabalho } from './Retrabalho';

@Entity({ name: 'divergencias' })
export class Divergencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste afetada
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Inspeção associada (Opcional/Nullable, caso seja apontado fora de uma inspeção formal)
  @ManyToOne(() => Inspecao, (inspecao) => inspecao.divergencias, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inspecao_id' })
  inspecao: Inspecao | null;

  @Column({ name: 'inspecao_id', type: 'uuid', nullable: true })
  inspecaoId: string | null;

  // Peça afetada (Opcional/Nullable, caso a divergência afete o lote como um todo)
  @ManyToOne(() => Peca, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'peca_id' })
  peca: Peca | null;

  @Column({ name: 'peca_id', type: 'uuid', nullable: true })
  pecaId: string | null;

  // Setor produtivo onde o problema foi identificado
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  // Operador/Inspetor que apontou o defeito
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reportado_por_id' })
  reportadoPor: Usuario;

  @Column({ name: 'reportado_por_id', type: 'uuid' })
  reportadoPorId: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ name: 'tipo_divergencia', type: 'varchar', length: 100 })
  tipoDivergencia: string; // Ex: DIMENSIONAL, VISUAL, MATERIAL, etc.

  @Column({ type: 'varchar', length: 50 })
  gravidade: string; // Ex: BAIXA, MEDIA, ALTA, CRITICA

  @Column({ type: 'boolean', default: false })
  resolvido: boolean;

  @Column({ name: 'data_resolucao', type: 'timestamp', nullable: true })
  dataResolucao: Date | null;

  // Usuário que validou a resolução da divergência
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolvido_por_id' })
  resolvidoPor: Usuario | null;

  @Column({ name: 'resolvido_por_id', type: 'uuid', nullable: true })
  resolvidoPorId: string | null;

  // Histórico de ordens de retrabalho cirúrgico vinculadas a esta não-conformidade
  @OneToMany(() => Retrabalho, (retrabalho) => retrabalho.divergencia)
  retrabalhos: Retrabalho[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
