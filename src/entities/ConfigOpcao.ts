import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ConfigCategoria } from './ConfigCategoria';

@Entity({ name: 'config_opcoes' })
export class ConfigOpcao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Categoria pai desta opção
  @ManyToOne(() => ConfigCategoria, (categoria) => categoria.opcoes, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoria_id' })
  categoria: ConfigCategoria;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoriaId: string;

  @Column({ type: 'varchar', length: 100 })
  valor: string; // Ex: 'URGENTE', 'COURO', 'LECTRA'

  @Column({ type: 'varchar', length: 150 })
  label: string; // Ex: 'Urgente', 'Couro Legítimo', 'Máquina Lectra'

  @Column({ type: 'int' })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
