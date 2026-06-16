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
import { Planta } from './Planta';
import { Usuario } from './Usuario';
import { Rastreamento } from './Rastreamento';

export enum OrdemTesteStatus {
  AGUARDANDO_MATERIAL         = 'AGUARDANDO_MATERIAL',
  CONFERENCIA_INICIAL         = 'CONFERENCIA_INICIAL',
  AGUARDANDO_VALIDACAO        = 'AGUARDANDO_VALIDACAO',
  EM_CORTE                    = 'EM_CORTE',
  INSPECAO_QUALIDADE          = 'INSPECAO_QUALIDADE',
  EM_RETRABALHO               = 'EM_RETRABALHO',
  SERIGRAFIA                  = 'SERIGRAFIA',
  APOIO                       = 'APOIO',
  BORDADO                     = 'BORDADO',
  COSTURA_PROGRAMADA          = 'COSTURA_PROGRAMADA',
  COSTURA                     = 'COSTURA',
  PRE_FABRICADO               = 'PRE_FABRICADO',
  MONTAGEM                    = 'MONTAGEM',
  VULCANIZADO                 = 'VULCANIZADO',
  LABORATORIO                 = 'LABORATORIO',
  AGUARDANDO_RESULTADO_FINAL  = 'AGUARDANDO_RESULTADO_FINAL', // v3.4 Reunião de Consenso
  APROVACAO_CONCESSAO         = 'APROVACAO_CONCESSAO',
  APROVADO                    = 'APROVADO',
  REPROVADO                   = 'REPROVADO',
  LIBERADO_PRODUCAO           = 'LIBERADO_PRODUCAO',
}

@Entity({ name: 'ordens_teste' })
export class OrdemTeste {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Modelo a ser testado nesta Ordem de Teste
  @ManyToOne(() => Modelo, (modelo) => modelo.ordensTeste, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: Modelo;

  @Column({ name: 'modelo_id', type: 'uuid' })
  modeloId: string;

  // Planta onde o teste de produção será executado
  @ManyToOne(() => Planta, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  // Usuário que criou a ordem de teste (geralmente PCP ou Modelista)
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor: Usuario;

  @Column({ name: 'criado_por_id', type: 'uuid' })
  criadoPorId: string;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 100, unique: true })
  codigoBarras: string;

  @Column({ name: 'data_inicio', type: 'timestamp' })
  dataInicio: Date;

  @Column({ name: 'data_fim_prevista', type: 'timestamp', nullable: true })
  dataFimPrevista: Date | null;

  @Column({ name: 'data_fim_real', type: 'timestamp', nullable: true })
  dataFimReal: Date | null;

  @Column({ name: 'prioridade_pcp', type: 'varchar', length: 20 })
  prioridadePcp: string;

  @Column({ type: 'enum', enum: OrdemTesteStatus, default: OrdemTesteStatus.AGUARDANDO_MATERIAL })
  status: OrdemTesteStatus;

  @Column({ name: 'liberado_producao', type: 'boolean', default: false })
  liberadoProducao: boolean;

  // Campo crítico para bifurcação do fluxo (indica se gera Caixa Teste + Lote Principal)
  @Column({ name: 'possui_caixa_teste', type: 'boolean', default: false })
  possuiCaixaTeste: boolean;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  // Rastreamentos associados às bipagens desta ordem
  @OneToMany(() => Rastreamento, (rastreamento) => rastreamento.ordemTeste)
  rastreamentos: Rastreamento[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
