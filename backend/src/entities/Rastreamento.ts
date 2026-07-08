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
import { OrdemTeste } from './OrdemTeste';
import { Peca } from './Peca';
import { Setor } from './Setor';
import { EstacaoTrabalho } from './EstacaoTrabalho';
import { Usuario } from './Usuario';
import { uuidv7 } from 'uuidv7';

export enum TipoLote {
  LOTE_PRINCIPAL = 'LOTE_PRINCIPAL',
  CAIXA_TESTE    = 'CAIXA_TESTE',
}

export enum RastreamentoStatus {
  EM_PROCESSO   = 'EM_PROCESSO',
  CONCLUIDO     = 'CONCLUIDO',
  REPROVADO     = 'REPROVADO',
  EM_RETRABALHO = 'EM_RETRABALHO',
}

@Entity({ name: 'rastreamentos' })
export class Rastreamento {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Ordem de teste associada
  @ManyToOne(() => OrdemTeste, (ordemTeste) => ordemTeste.rastreamentos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Peça específica (nula se for rastreamento/bipagem do lote completo pós-corte)
  @ManyToOne(() => Peca, (peca) => peca.rastreamentos, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'peca_id' })
  peca: Peca | null;

  @Column({ name: 'peca_id', type: 'uuid', nullable: true })
  pecaId: string | null;

  // Setor onde ocorreu a bipagem
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  // Estação de trabalho/máquina física da bipagem
  @ManyToOne(() => EstacaoTrabalho, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estacao_id' })
  estacao: EstacaoTrabalho | null;

  @Column({ name: 'estacao_id', type: 'uuid', nullable: true })
  estacaoId: string | null;

  // Operador que realizou a bipagem de entrada
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operador_entrada_id' })
  operadorEntrada: Usuario | null;

  @Column({ name: 'operador_entrada_id', type: 'uuid', nullable: true })
  operadorEntradaId: string | null;

  // Operador que realizou a bipagem de saída (handoff)
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operador_saida_id' })
  operadorSaida: Usuario | null;

  @Column({ name: 'operador_saida_id', type: 'uuid', nullable: true })
  operadorSaidaId: string | null;

  // Chave da inspeção que liberou a saída do setor (Categoria B - Gate Obrigatório).
  // Mapeada como coluna para evitar dependência de compilação nesta fase inicial.
  @Column({ name: 'inspecao_saida_id', type: 'uuid', nullable: true })
  inspecaoSaidaId: string | null;

  @Column({ type: 'enum', enum: TipoLote, default: TipoLote.LOTE_PRINCIPAL })
  tipoLote: TipoLote;

  @Column({ name: 'data_entrada', type: 'timestamp', nullable: true })
  dataEntrada: Date | null;

  @Column({ name: 'data_saida', type: 'timestamp', nullable: true })
  dataSaida: Date | null;

  @Column({ name: 'tempo_permanencia_min', type: 'int', nullable: true })
  tempoPermanenciaMin: number | null;

  @Column({ type: 'enum', enum: RastreamentoStatus, default: RastreamentoStatus.EM_PROCESSO })
  status: RastreamentoStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
