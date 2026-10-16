import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Modelo } from './Modelo';
import { Setor } from './Setor';
import { Planta } from './Planta';

export enum TipoExecucao {
  SEQUENCIAL = 'SEQUENCIAL',
  PARALELO   = 'PARALELO',
}

@Entity({ name: 'rota_modelo' })
export class RotaModelo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Modelo associado à rota
  @ManyToOne(() => Modelo, (modelo) => modelo.rotas, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: Modelo;

  @Column({ name: 'modelo_id', type: 'uuid' })
  modeloId: string;

  @ManyToOne(() => Planta, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  // Setor por onde passa esta etapa da rota
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  @Column({ type: 'int' })
  ordem: number;

  @Column({ name: 'sla_alvo_min', type: 'int', default: 120 })
  slaAlvoMin: number;

  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ type: 'boolean', default: true })
  obrigatorio: boolean;

  @Column({ type: 'enum', enum: TipoExecucao, default: TipoExecucao.SEQUENCIAL })
  tipoExecucao: TipoExecucao;

  @Column({ name: 'bipagem_apenas_saida', type: 'boolean', default: false })
  bipagemApenasSaida: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
