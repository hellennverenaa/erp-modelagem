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
import { Modelo } from './Modelo';
import { Rastreamento } from './Rastreamento';

@Entity({ name: 'pecas' })
export class Peca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Modelo do qual esta peça faz parte
  @ManyToOne(() => Modelo, (modelo) => modelo.pecas, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: Modelo;

  @Column({ name: 'modelo_id', type: 'uuid' })
  modeloId: string;

  @Column({ type: 'varchar', length: 150 })
  nome: string;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 100, unique: true, nullable: true })
  codigoBarras: string | null;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  // Referência dinâmica a config_opcoes (categoria 'subsetor_corte')
  // Determina para qual subsetor de máquina a peça vai na etapa de distribuição do corte.
  @Column({ name: 'setor_corte_opcao_id', type: 'uuid' })
  setorCorteOpcaoId: string;

  // Rastreamentos associados às bipagens individuais desta peça
  @OneToMany(() => Rastreamento, (rastreamento) => rastreamento.peca)
  rastreamentos: Rastreamento[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
