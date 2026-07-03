import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ConfigOpcao } from './ConfigOpcao';

@Entity({ name: 'config_categorias' })
export class ConfigCategoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string; // Ex: 'setor_tipo', 'prioridade_pcp', 'tipo_material'

  @Column({ name: 'nome_exibicao', type: 'varchar', length: 150 })
  nomeExibicao: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Lista de opções cadastradas nesta categoria
  @OneToMany(() => ConfigOpcao, (opcao) => opcao.categoria)
  opcoes: ConfigOpcao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
