import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'rbac_catalogo' })
export class RbacCatalogItem {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  chave: string;

  @Column({ type: 'varchar', length: 20 })
  tipo: 'tela' | 'acao_global' | 'acao_setor';

  @Column({ type: 'jsonb' })
  definicao: Record<string, string>;

  @Column({ type: 'integer' })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;
}
