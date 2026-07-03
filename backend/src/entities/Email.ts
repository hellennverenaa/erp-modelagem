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
import { Checklist } from './Checklist';

export enum TipoEmail {
  CHECKLIST_CONCESSAO  = 'CHECKLIST_CONCESSAO',
  CHECKLIST_PENDENCIAS = 'CHECKLIST_PENDENCIAS',
  NOTIFICACAO_GERAL    = 'NOTIFICACAO_GERAL',
  DOSSIE_COMPILADO     = 'DOSSIE_COMPILADO',
}

export enum EmailStatus {
  PENDENTE = 'PENDENTE',
  ENVIADO  = 'ENVIADO',
  ERRO     = 'ERRO',
}

@Entity({ name: 'emails' })
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste associada ao disparo
  @ManyToOne(() => OrdemTeste, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste | null;

  @Column({ name: 'ordem_teste_id', type: 'uuid', nullable: true })
  ordemTesteId: string | null;

  // Checklist que triggerou o e-mail (opcional)
  @ManyToOne(() => Checklist, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'checklist_id' })
  checklist: Checklist | null;

  @Column({ name: 'checklist_id', type: 'uuid', nullable: true })
  checklistId: string | null;

  @Column({ name: 'tipo_email', type: 'enum', enum: TipoEmail })
  tipoEmail: TipoEmail;

  @Column({ type: 'varchar', length: 255 })
  assunto: string;

  @Column({ name: 'corpo_html', type: 'text' })
  corpoHtml: string;

  // Lista de e-mails destinatários
  @Column({ type: 'jsonb' })
  destinatarios: string[];

  @Column({ name: 'data_envio', type: 'timestamp', nullable: true })
  dataEnvio: Date | null;

  @Column({ type: 'enum', enum: EmailStatus, default: EmailStatus.PENDENTE })
  status: EmailStatus;

  @Column({ name: 'erro_mensagem', type: 'text', nullable: true })
  erroMensagem: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
