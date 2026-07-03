import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrdemTeste } from './OrdemTeste';
import { Usuario } from './Usuario';

export enum TipoAprovacao {
  REUNIAO_CONSENSO = 'REUNIAO_CONSENSO',
  INTERMEDIARIA    = 'INTERMEDIARIA',
}

export enum ResultadoAprovacao {
  APROVADO           = 'APROVADO',
  APROVADO_CONCESSAO = 'APROVADO_CONCESSAO',
  REPROVADO          = 'REPROVADO',
}

@Entity({ name: 'aprovacoes_finais' })
export class AprovacaoFinal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste que está sendo decidida
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Gerente de modelagem / Aprovador que registrou o veredito
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'aprovador_id' })
  aprovador: Usuario;

  @Column({ name: 'aprovador_id', type: 'uuid' })
  aprovadorId: string;

  @Column({ type: 'enum', enum: TipoAprovacao, default: TipoAprovacao.REUNIAO_CONSENSO })
  tipo: TipoAprovacao;

  @Column({ type: 'enum', enum: ResultadoAprovacao })
  resultado: ResultadoAprovacao;

  @Column({ type: 'text' })
  justificativa: string; // Fundamentação obrigatória

  @Column({ name: 'data_aprovacao', type: 'timestamp' })
  dataAprovacao: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
