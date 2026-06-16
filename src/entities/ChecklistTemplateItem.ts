import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChecklistTemplate } from './ChecklistTemplate';

@Entity({ name: 'checklist_template_itens' })
export class ChecklistTemplateItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Template pai deste item de verificação
  @ManyToOne(() => ChecklistTemplate, (template) => template.itens, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: ChecklistTemplate;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ type: 'varchar', length: 255 })
  descricao: string;

  // Tipo de resposta aceito (ex: 'BOOLEAN', 'TEXTO', 'VALOR')
  @Column({ name: 'tipo_resposta', type: 'varchar', length: 50 })
  tipoResposta: string;

  @Column({ type: 'boolean', default: true })
  obrigatorio: boolean;

  @Column({ type: 'int' })
  ordem: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
