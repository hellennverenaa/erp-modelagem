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
import { Setor } from './Setor';
import { Usuario } from './Usuario';

@Entity({ name: 'validacoes_setor' })
export class ValidacaoSetor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ordem de teste que está sendo validada
  @ManyToOne(() => OrdemTeste, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_teste_id' })
  ordemTeste: OrdemTeste;

  @Column({ name: 'ordem_teste_id', type: 'uuid' })
  ordemTesteId: string;

  // Setor produtivo onde ocorreu a validação
  @ManyToOne(() => Setor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ name: 'setor_id', type: 'uuid' })
  setorId: string;

  // Coordenador/Validador responsável
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'validador_id' })
  validador: Usuario;

  @Column({ name: 'validador_id', type: 'uuid' })
  validadorId: string;

  @Column({ name: 'data_validacao', type: 'timestamp' })
  dataValidacao: Date;

  @Column({ type: 'boolean' })
  aprovado: boolean;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
