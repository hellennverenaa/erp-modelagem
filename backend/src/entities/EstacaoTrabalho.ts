import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Setor } from './Setor';

@Entity({ name: 'estacoes_trabalho' })
export class EstacaoTrabalho {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Setor ao qual esta estação de trabalho / máquina pertence
  @ManyToOne(() => Setor, (setor) => setor.estacoesTrabalho, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descricao: string | null;

  @Column({ name: 'tipo_equipamento', type: 'varchar', length: 100, nullable: true })
  tipoEquipamento: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
