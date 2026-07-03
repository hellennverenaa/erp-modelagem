import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Usuario } from './Usuario';
import { PerfilPermissao } from './PerfilPermissao';

@Entity({ name: 'perfis' })
export class Perfil {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nome único do perfil (ex: REVISORA, COORDENADOR_SETOR, ASSISTENTE_MODELAGEM, ADMIN, OPERADOR)
  @Column({ type: 'varchar', length: 50, unique: true })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  // Mapa JSONB de privilégios e permissões UI/módulos
  @Column({ type: 'jsonb', nullable: true })
  permissoes: Record<string, any> | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Usuários associados a este perfil
  @OneToMany(() => Usuario, (usuario) => usuario.perfil)
  usuarios: Usuario[];

  // Matriz de permissões dinâmicas vinculadas aos setores do chão de fábrica (RBAC)
  @OneToMany(() => PerfilPermissao, (perfilPermissao) => perfilPermissao.perfil)
  perfilPermissoes: PerfilPermissao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
