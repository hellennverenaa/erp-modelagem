import {
  Entity,
  PrimaryColumn,
  BeforeInsert,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

@Entity({ name: 'catalogo_pecas' })
export class CatalogoPeca {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Número identificador da peça técnica (ex: "026", "620")
  @Column({ type: 'varchar', length: 50, unique: true })
  numero: string;

  // Nome padronizado da peça (ex: "GÁSPEA", "BIQUEIRA", "VISTA")
  @Column({ type: 'varchar', length: 200 })
  nome: string;

  // Código original/referência do arquivo CSV (ex: "03060908" / "026_GAS-1")
  @Column({ name: 'codigo_original', type: 'varchar', length: 100, nullable: true })
  codigoOriginal: string | null;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
