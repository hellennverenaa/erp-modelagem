import {
  Entity,
  PrimaryColumn,
  BeforeInsert,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ConfigOpcao } from './ConfigOpcao';
import { uuidv7 } from 'uuidv7';

@Entity({ name: 'catalogo_itens_checklist' })
export class CatalogoItemChecklist {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Setor associado via config_opcoes (categoria 'setor_tipo')
  @ManyToOne(() => ConfigOpcao, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_tipo_opcao_id' })
  setorTipoOpcao: ConfigOpcao;

  @Column({ name: 'setor_tipo_opcao_id', type: 'uuid' })
  setorTipoOpcaoId: string;

  // Número ordinal do item no checklist (ex: 1 a 153)
  @Column({ name: 'numero_item', type: 'int' })
  numeroItem: number;

  // Descrição do item a ser checado (ex: "Arquivo de corte", "Base de Fuse")
  @Column({ type: 'text' })
  descricao: string;

  // Tipo de resposta esperado (ex: "OK_NA_PENDENTE", "STATUS", "CONFORME")
  @Column({ name: 'tipo_resposta', type: 'varchar', length: 50, default: 'OK_NA_PENDENTE' })
  tipoResposta: string;

  @Column({ type: 'boolean', default: true })
  obrigatorio: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
