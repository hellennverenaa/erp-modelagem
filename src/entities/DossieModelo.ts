import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OrdemTeste } from './OrdemTeste';
import { Modelo } from './Modelo';
import { Usuario } from './Usuario';

export enum DossieStatus {
  PENDENTE  = 'PENDENTE',
  GERANDO   = 'GERANDO',
  CONCLUIDO = 'CONCLUIDO',
  ERRO      = 'ERRO',
}

@Entity({ name: 'dossies_modelo' })
export class DossieModelo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relação 1:1 com a Ordem de Teste correspondente (único dossiê por teste)
  @OneToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid', unique: true })
  ordemTesteId: string;

  // Modelo documentado no dossiê
  @ManyToOne(() => Modelo, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: Modelo;

  @Column({ name: 'modelo_id', type: 'uuid' })
  modeloId: string;

  // Usuário que disparou/concluiu a geração do dossiê (Gerente de Modelagem)
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'gerado_por_id' })
  geradoPor: Usuario;

  @Column({ name: 'gerado_por_id', type: 'uuid' })
  geradoPorId: string;

  @Column({ type: 'enum', enum: DossieStatus, default: DossieStatus.PENDENTE })
  status: DossieStatus;

  @Column({ name: 'caminho_pdf', type: 'varchar', length: 500, nullable: true })
  caminhoPdf: string | null;

  @Column({ name: 'tamanho_bytes', type: 'int', nullable: true })
  tamanhoBytes: number | null;

  // Metadados sobre a compilação do relatório final (erros, duração, etc.)
  @Column({ name: 'metadados_compilacao', type: 'jsonb', nullable: true })
  metadadosCompilacao: Record<string, any> | null;

  @Column({ name: 'gerado_em', type: 'timestamp', nullable: true })
  geradoEm: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
