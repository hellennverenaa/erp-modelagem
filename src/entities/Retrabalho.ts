import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Divergencia } from './Divergencia';
import { OrdemTeste } from './OrdemTeste';
import { Peca } from './Peca';
import { Setor } from './Setor';
import { Usuario } from './Usuario';

@Entity({ name: 'retrabalhos' })
export class Retrabalho {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Divergência que originou o retrabalho
  @ManyToOne(() => Divergencia, (divergencia) => divergencia.retrabalhos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'divergencia_id' })
  divergencia: Divergencia;

  @Column({ name: 'divergencia_id', type: 'uuid' })
  divergenciaId: string;

  // Ordem de teste correspondente
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Peça específica que será retrabalhada
  @ManyToOne(() => Peca, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'peca_id' })
  peca: Peca;

  @Column({ name: 'peca_id', type: 'uuid' })
  pecaId: string;

  // Setor de origem (onde o defeito de qualidade foi detectado)
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_origem_id' })
  setorOrigem: Setor;

  @Column({ name: 'setor_origem_id', type: 'uuid' })
  setorOrigemId: string;

  // Setor de destino (onde a peça voltará para ser refeita - Retrabalho Cirúrgico)
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_destino_id' })
  setorDestino: Setor;

  @Column({ name: 'setor_destino_id', type: 'uuid' })
  setorDestinoId: string;

  // Colaborador encarregado da execução ou monitoramento do retrabalho
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: Usuario;

  @Column({ name: 'responsavel_id', type: 'uuid' })
  responsavelId: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDENTE' })
  status: string; // Ex: PENDENTE, EM_ANDAMENTO, CONCLUIDO

  @Column({ name: 'data_inicio', type: 'timestamp', nullable: true })
  dataInicio: Date | null;

  @Column({ name: 'data_fim', type: 'timestamp', nullable: true })
  dataFim: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
