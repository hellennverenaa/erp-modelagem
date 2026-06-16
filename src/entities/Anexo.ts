import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './Usuario';

@Entity({ name: 'anexos' })
export class Anexo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nome do tipo da entidade associada (ex: 'ocorrencias_producao', 'etapas_corte', 'dossies_modelo')
  @Column({ name: 'entidade_tipo', type: 'varchar', length: 100 })
  entidadeTipo: string;

  // ID da entidade associada (chave primária UUID da tabela correspondente)
  @Column({ name: 'entidade_id', type: 'uuid' })
  entidadeId: string;

  @Column({ name: 'nome_arquivo', type: 'varchar', length: 255 })
  nomeArquivo: string;

  @Column({ name: 'caminho_arquivo', type: 'varchar', length: 500 })
  caminhoArquivo: string;

  @Column({ name: 'tipo_mime', type: 'varchar', length: 100 })
  tipoMime: string;

  @Column({ name: 'tamanho_bytes', type: 'int' })
  tamanhoBytes: number;

  // Usuário que realizou o upload do anexo
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_por_id' })
  uploadedPor: Usuario;

  @Column({ name: 'uploaded_por_id', type: 'uuid' })
  uploadedPorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
