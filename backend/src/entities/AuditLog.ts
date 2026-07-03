import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './Usuario';

// Esta entidade é logicamente append-only. Não deve possuir lógica de update/delete no sistema.
@Entity({ name: 'audit_log' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Usuário que realizou a ação (nulo para processos automáticos do sistema)
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 150 })
  acao: string; // Ex: 'BIPAR_SAIDA', 'CRIAR_OP', 'PREENCHER_CHECKLIST'

  @Column({ name: 'entidade_tipo', type: 'varchar', length: 100 })
  entidadeTipo: string; // Ex: 'rastreamentos', 'ordens_teste'

  @Column({ name: 'entidade_id', type: 'uuid' })
  entidadeId: string;

  @Column({ name: 'dados_anteriores', type: 'jsonb', nullable: true })
  dadosAnteriores: Record<string, any> | null;

  @Column({ name: 'dados_novos', type: 'jsonb', nullable: true })
  dadosNovos: Record<string, any> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
