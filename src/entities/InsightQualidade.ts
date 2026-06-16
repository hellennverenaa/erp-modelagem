import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Planta } from './Planta';

export enum TipoInsight {
  PARETO_REPROVACOES = 'PARETO_REPROVACOES',
  SLA_LEAD_TIME      = 'SLA_LEAD_TIME',
  EFICIENCIA         = 'EFICIENCIA',
}

@Entity({ name: 'insights_qualidade' })
export class InsightQualidade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Planta analisada
  @ManyToOne(() => Planta, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  @Column({ type: 'enum', enum: TipoInsight })
  tipo: TipoInsight;

  // Distribuição de Pareto das falhas mais comuns
  @Column({ name: 'dados_pareto', type: 'jsonb', nullable: true })
  dadosPareto: Record<string, any> | null;

  // Mapeamento de reprovações por setor
  @Column({ name: 'dados_setor_reprovacao', type: 'jsonb', nullable: true })
  dadosSetorReprovacao: Record<string, any> | null;

  // Resumo executivo gerado pela IA (Genkit/Gemini)
  @Column({ name: 'resumo_ia', type: 'text', nullable: true })
  resumoIa: string | null;

  // Recomendações de mitigação geradas pela IA
  @Column({ name: 'recomendacoes_ia', type: 'text', nullable: true })
  recomendacoesIa: string | null;

  @Column({ name: 'periodo_inicio', type: 'timestamp' })
  periodoInicio: Date;

  @Column({ name: 'periodo_fim', type: 'timestamp' })
  periodoFim: Date;

  @Column({ name: 'gerado_em', type: 'timestamp' })
  geradoEm: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
