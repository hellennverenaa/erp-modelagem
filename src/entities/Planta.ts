import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Setor } from './Setor';
import { Usuario } from './Usuario';

@Entity({ name: 'plantas' })
export class Planta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  nome: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  endereco: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cidade: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  estado: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Relacionamento um-para-muitos com setores pertencentes a esta planta
  @OneToMany(() => Setor, (setor) => setor.planta)
  setores: Setor[];

  // Relacionamento um-para-muitos com usuários/colaboradores lotados nesta planta
  @OneToMany(() => Usuario, (usuario) => usuario.planta)
  usuarios: Usuario[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
