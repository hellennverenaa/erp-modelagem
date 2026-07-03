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
import { ChecklistTemplate } from './ChecklistTemplate';
import { Setor } from './Setor';
import { Usuario } from './Usuario';
import { ChecklistItem } from './ChecklistItem';

export enum ChecklistStatus {
  PREENCHIDO     = 'PREENCHIDO',
  COM_PENDENCIAS = 'COM_PENDENCIAS',
  EM_ANDAMENTO   = 'EM_ANDAMENTO',
}

@Entity({ name: 'checklists' })
export class Checklist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste que está sendo checada
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Template utilizado para instanciar as perguntas
  @ManyToOne(() => ChecklistTemplate, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template: ChecklistTemplate;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  // Setor produtivo onde o checklist está sendo aplicado
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  // Colaborador que preencheu o checklist
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'preenchido_por_id' })
  preenchidoPor: Usuario;

  @Column({ name: 'preenchido_por_id', type: 'uuid' })
  preenchidoPorId: string;

  @Column({ name: 'data_preenchimento', type: 'timestamp' })
  dataPreenchimento: Date;

  @Column({ type: 'enum', enum: ChecklistStatus, default: ChecklistStatus.EM_ANDAMENTO })
  status: ChecklistStatus;

  // Se for true, impede a bipagem de saída / handoff caso o status seja COM_PENDENCIAS
  @Column({ type: 'boolean', default: false })
  bloqueante: boolean;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  // Itens checados/respostas correspondentes
  @OneToMany(() => ChecklistItem, (item) => item.checklist)
  itens: ChecklistItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
