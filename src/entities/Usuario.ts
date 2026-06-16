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
import { Perfil } from './Perfil';
import { Setor } from './Setor';
import { Planta } from './Planta';

@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Perfil de acesso do usuário (RBAC)
  @ManyToOne(() => Perfil, (perfil) => perfil.usuarios, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'perfil_id' })
  perfil: Perfil;

  @Column({ name: 'perfil_id', type: 'uuid' })
  perfilId: string;

  // Setor padrão de alocação (opcional, aplicável a operadores de chão de fábrica)
  @ManyToOne(() => Setor, (setor) => setor.usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor | null;

  @Column({ name: 'setor_id', type: 'uuid', nullable: true })
  setorId: string | null;

  // Planta fabril de lotação principal
  @ManyToOne(() => Planta, (planta) => planta.usuarios, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  // Gestor direto do usuário (autorrelacionamento hierárquico)
  @ManyToOne(() => Usuario, (usuario) => usuario.subordinados, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gestor_id' })
  gestor: Usuario | null;

  @Column({ name: 'gestor_id', type: 'uuid', nullable: true })
  gestorId: string | null;

  @Column({ name: 'nome_completo', type: 'varchar', length: 200 })
  nomeCompleto: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  usuario: string;

  @Column({ name: 'senha_hash', type: 'varchar', length: 255 })
  senhaHash: string;

  @Column({ type: 'varchar', length: 100 })
  cargo: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'ultimo_acesso', type: 'timestamp', nullable: true })
  ultimoAcesso: Date | null;

  // Subordinados deste gestor (relacionamento inverso)
  @OneToMany(() => Usuario, (usuario) => usuario.gestor)
  subordinados: Usuario[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
