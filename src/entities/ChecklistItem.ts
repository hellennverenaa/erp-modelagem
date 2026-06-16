import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Checklist } from './Checklist';
import { ChecklistTemplateItem } from './ChecklistTemplateItem';

@Entity({ name: 'checklist_itens' })
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Checklist pai deste item respondido
  @ManyToOne(() => Checklist, (checklist) => checklist.itens, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'checklist_id' })
  checklist: Checklist;

  @Column({ name: 'checklist_id', type: 'uuid' })
  checklistId: string;

  // Associação opcional (nula quando for um item avulso injetado em tempo real)
  @ManyToOne(() => ChecklistTemplateItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_item_id' })
  templateItem: ChecklistTemplateItem | null;

  @Column({ name: 'template_item_id', type: 'uuid', nullable: true })
  templateItemId: string | null;

  // Descrição do item injetado dinamicamente no chão de fábrica
  @Column({ name: 'descricao_avulsa', type: 'varchar', length: 255, nullable: true })
  descricaoAvulsa: string | null;

  @Column({ name: 'valor_resposta', type: 'text', nullable: true })
  valorResposta: string | null;

  @Column({ type: 'boolean', default: true })
  conforme: boolean;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
