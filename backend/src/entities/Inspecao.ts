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
import { OrdemTeste } from './OrdemTeste';
import { Setor } from './Setor';
import { Usuario } from './Usuario';
import { TipoLote } from './Rastreamento';
import { InspecaoPeca } from './InspecaoPeca';
import { Divergencia } from './Divergencia';

export enum TipoInspecao {
  SAIDA_SETOR       = 'SAIDA_SETOR',       // Gate obrigatório nos setores pós-corte
  FORMAL            = 'FORMAL',            // Avaliação formal peça por peça
  LABORATORIO       = 'LABORATORIO',       // Ensaios laboratoriais finais
  LABORATORIO_APOIO = 'LABORATORIO_APOIO', // Testes exigidos no micro-fluxo do Apoio
}

export enum ResultadoInspecao {
  APROVADO           = 'APROVADO',
  REPROVADO          = 'REPROVADO', // Desencadeia o fluxo de retrabalho cirúrgico
  APROVADO_PARCIAL   = 'APROVADO_PARCIAL',
  APROVADO_CONCESSAO = 'APROVADO_CONCESSAO',
}

@Entity({ name: 'inspecoes' })
export class Inspecao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste que está sendo inspecionada
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Inspetora de qualidade responsável
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inspetor_id' })
  inspetor: Usuario;

  @Column({ name: 'inspetor_id', type: 'uuid' })
  inspetorId: string;

  // Setor físico da inspeção
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  @Column({ type: 'enum', enum: TipoInspecao })
  tipoInspecao: TipoInspecao;

  @Column({ type: 'enum', enum: TipoLote })
  tipoLote: TipoLote;

  @Column({ name: 'data_inspecao', type: 'timestamp' })
  dataInspecao: Date;

  @Column({ type: 'enum', enum: ResultadoInspecao })
  resultado: ResultadoInspecao;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  // Detalhes individuais de peças inspecionadas
  @OneToMany(() => InspecaoPeca, (item) => item.inspecao)
  inspecaoPecas: InspecaoPeca[];

  // Divergências apontadas nesta inspeção
  @OneToMany(() => Divergencia, (divergencia) => divergencia.inspecao)
  divergencias: Divergencia[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
