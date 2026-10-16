import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { OrdemTeste } from './OrdemTeste';
import { Setor } from './Setor';

@Entity({ name: 'tickets_setor' })
@Unique('uq_tickets_setor_ordem_setor', ['ordemTesteId', 'setorId'])
@Unique('uq_tickets_setor_codigo_barras', ['codigoBarras'])
@Index('idx_tickets_setor_ordem_etapa', ['ordemTesteId', 'ordemEtapa'])
export class TicketSetor {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 64 })
  codigoBarras: string;

  @ManyToOne(() => OrdemTeste, (ordemTeste) => ordemTeste.ticketsSetor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  @Column({ name: 'rota_versao', type: 'integer' })
  rotaVersao: number;

  @Column({ name: 'ordem_etapa', type: 'integer' })
  ordemEtapa: number;

  @Column({ name: 'setor_nome_snapshot', type: 'varchar', length: 150 })
  setorNomeSnapshot: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  static criarCodigoBarras(id = uuidv7()): { id: string; codigoBarras: string } {
    return { id, codigoBarras: `TKT-${id.toUpperCase()}` };
  }
}
