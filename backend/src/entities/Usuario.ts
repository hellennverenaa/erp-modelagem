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
import { Perfil } from './Perfil';
import { Setor } from './Setor';
import { Planta } from './Planta';

@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Perfil de acesso do usuário (RBAC)
  @ManyToOne(() => Perfil, (perfil) => perfil.usuarios, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'perfil_id' })
  perfil: Perfil;

  @Column({ name: 'perfil_id', type: 'uuid' })
  perfilId: string;

  // Setor padrão de alocação (opcional, aplicável a operadores de chão de fábrica)
  @ManyToOne(() => Setor, (setor) => setor.usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor | null;

  @Column({ name: 'setor_id', type: 'uuid', nullable: true })
  setorId: string | null;

  // Planta fabril de lotação principal
  @ManyToOne(() => Planta, (planta) => planta.usuarios, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planta_id' })
  planta: Planta;

  @Column({ name: 'planta_id', type: 'uuid' })
  plantaId: string;

  // Gestor direto do usuário (autorrelacionamento hierárquico)
  @ManyToOne(() => Usuario, (usuario) => usuario.subordinados, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gestor_id' })
  gestor: Usuario | null;

  @Column({ name: 'gestor_id', type: 'uuid', nullable: true })
  gestorId: string | null;

  @Column({ name: 'nome_completo', type: 'varchar', length: 200 })
  nomeCompleto: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  usuario: string;

  @Column({ name: 'senha_hash', type: 'varchar', length: 255 })
  senhaHash: string;

  @Column({ type: 'varchar', length: 100 })
  cargo: string;

  // Código do crachá para autenticação por aproximação no Modo Quiosque
  // Suporta leitura agnóstica de hardware (Leitores RFID e Leitores de Código de Barras)
  @Column({ name: 'codigo_crachao', type: 'varchar', length: 50, unique: true, nullable: true })
  codigoCrachao: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  /**
   * Função estática para normalização agnóstica de crachás (RFID / Código de Barras).
   * Elimina espaços, caracteres de controle de leitores de código de barras e padroniza caixa alta.
   */
  static normalizarCodigoCrachao(input: string | null | undefined): string {
    if (!input) return '';
    // Remove caracteres nulos/controle comuns em scanners USB (ex: \r, \n, \t) e espaços
    let limpo = input.replace(/[\r\n\t\f\v]/g, '').trim();
    // Converter para maiúsculas para manter consistência entre RFID hex/dec e Barcodes
    limpo = limpo.toUpperCase();
    return limpo;
  }

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'ultimo_acesso', type: 'timestamp', nullable: true })
  ultimoAcesso: Date | null;

  // Subordinados deste gestor (relacionamento inverso)
  @OneToMany(() => Usuario, (usuario) => usuario.gestor)
  subordinados: Usuario[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
