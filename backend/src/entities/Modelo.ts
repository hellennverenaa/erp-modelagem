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
import { Marca } from './Marca';
import { Peca } from './Peca';
import { RotaModelo } from './RotaModelo';
import { OrdemTeste } from './OrdemTeste';

export enum ModeloStatus {
  CADASTRADO   = 'CADASTRADO',
  EM_TESTE     = 'EM_TESTE',
  LIBERADO     = 'LIBERADO',
  NAO_LIBERADO = 'NAO_LIBERADO',
}

@Entity({ name: 'modelos' })
export class Modelo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Marca proprietária deste modelo
  @ManyToOne(() => Marca, (marca) => marca.modelos, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  marca: Marca;

  @Column({ name: 'marca_id', type: 'uuid' })
  marcaId: string;

  @Column({ name: 'codigo_produto', type: 'varchar', length: 50 })
  codigoProduto: string;

  @Column({ type: 'varchar', length: 150 })
  nome: string;

  @Column({ name: 'mfm_referencia_url', type: 'varchar', length: 255, nullable: true })
  mfmReferenciaUrl: string | null;

  @Column({ name: 'ficha_tecnica_url', type: 'varchar', length: 255, nullable: true })
  fichaTecnicaUrl: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  temporada: string | null;

  @Column({ type: 'enum', enum: ModeloStatus, default: ModeloStatus.CADASTRADO })
  status: ModeloStatus;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Peças constitutivas (cabedais, forros, etc.) do modelo
  @OneToMany(() => Peca, (peca) => peca.modelo)
  pecas: Peca[];

  // Etapas da rota operacional desenhada para o teste deste modelo
  @OneToMany(() => RotaModelo, (rota) => rota.modelo)
  rotas: RotaModelo[];

  // Ordens de teste de produção associadas
  @OneToMany(() => OrdemTeste, (ordemTeste) => ordemTeste.modelo)
  ordensTeste: OrdemTeste[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
