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
import { Planta } from './Planta';
import { EstacaoTrabalho } from './EstacaoTrabalho';
import { Usuario } from './Usuario';
import { PerfilPermissao } from './PerfilPermissao';

@Entity({ name: 'setores' })
export class Setor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Associação com a Planta correspondente
  @ManyToOne(() => Planta, (planta) => planta.setores, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  @Column({ type: 'varchar', length: 100 })
  nome: string;

  // Referência dinâmica para config_opcoes (categoria 'setor_tipo').
  // Definido como coluna para evitar dependência direta nesta fase inicial de entidades.
  @Column({ name: 'tipo_opcao_id', type: 'uuid' })
  tipoOpcaoId: string;

  @Column({ name: 'ordem_fluxo', type: 'int' })
  ordemFluxo: number;

  @Column({ name: 'is_condicional', type: 'boolean', default: false })
  isCondicional: boolean;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Máquinas ou estações de trabalho contidas neste setor
  @OneToMany(() => EstacaoTrabalho, (estacao) => estacao.setor)
  estacoesTrabalho: EstacaoTrabalho[];

  // Operadores ou supervisores alocados especificamente neste setor
  @OneToMany(() => Usuario, (usuario) => usuario.setor)
  usuarios: Usuario[];

  // Permissões associadas dinamicamente a este setor para o controle de RBAC
  @OneToMany(() => PerfilPermissao, (perfilPermissao) => perfilPermissao.setor)
  perfilPermissoes: PerfilPermissao[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
