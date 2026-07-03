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
import { Modelo } from './Modelo';
import { Marca } from './Marca';
import { ChecklistTemplateItem } from './ChecklistTemplateItem';
import { Checklist } from './Checklist';

@Entity({ name: 'checklist_templates' })
export class ChecklistTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Modelo associado (Opcional. Se nulo, o template aplica-se a toda a Marca)
  @ManyToOne(() => Modelo, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: Modelo | null;

  @Column({ name: 'modelo_id', type: 'uuid', nullable: true })
  modeloId: string | null;

  // Marca proprietária do template
  @ManyToOne(() => Marca, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  marca: Marca;

  @Column({ name: 'marca_id', type: 'uuid' })
  marcaId: string;

  // Referência ao tipo do setor (config_opcoes, categoria 'setor_tipo') onde o template é exigido
  @Column({ name: 'setor_tipo_opcao_id', type: 'uuid' })
  setorTipoOpcaoId: string;

  @Column({ type: 'varchar', length: 100 })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Itens cadastrados no template
  @OneToMany(() => ChecklistTemplateItem, (item) => item.template)
  itens: ChecklistTemplateItem[];

  // Checklists preenchidos a partir deste template
  @OneToMany(() => Checklist, (checklist) => checklist.template)
  checklists: Checklist[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
