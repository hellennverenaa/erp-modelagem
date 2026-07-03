import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Perfil } from './Perfil';
import { Setor } from './Setor';

// Enum contendo as ações válidas para controle de RBAC em tempo de execução
export enum AcaoSetor {
  BIPAR_ENTRADA             = 'BIPAR_ENTRADA',             // Entrada física de lote/peça no setor
  BIPAR_SAIDA               = 'BIPAR_SAIDA',               // Saída física (Handoff Automático nos setores iniciais)
  REVISAO_MAQUINA           = 'REVISAO_MAQUINA',           // Primeiro bip do Corte Automático por Máquina (Revisora)
  FECHAMENTO_LOTE           = 'FECHAMENTO_LOTE',           // Segundo bip — check OK/NÃO OK pelo Coordenador
  PREENCHER_CHECKLIST       = 'PREENCHER_CHECKLIST',       // Checklist do Almoxarifado/Navalha/Telas
  INSPECIONAR_SETOR         = 'INSPECIONAR_SETOR',         // Inspetora de Qualidade — gate seletivo pós-Corte
  EDITAR_ROTA               = 'EDITAR_ROTA',               // Modelista gerenciando rota de modelo
  ADMINISTRAR_RBAC          = 'ADMINISTRAR_RBAC',          // Alteração dinâmica das permissões
  REGISTRAR_VEREDICTO_FINAL = 'REGISTRAR_VEREDICTO_FINAL', // Registro do veredicto final pelo Gerente de Modelagem
}

@Entity({ name: 'perfil_permissoes' })
export class PerfilPermissao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Perfil concedido
  @ManyToOne(() => Perfil, (perfil) => perfil.perfilPermissoes, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'perfil_id' })
  perfil: Perfil;

  @Column({ name: 'perfil_id', type: 'uuid' })
  perfilId: string;

  // Setor aplicável. Se for nulo, a permissão é considerada global (ex: ADMINISTRAR_RBAC)
  @ManyToOne(() => Setor, (setor) => setor.perfilPermissoes, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor | null;

  @Column({ name: 'setor_id', type: 'uuid', nullable: true })
  setorId: string | null;

  @Column({ type: 'varchar', length: 100 })
  acao: AcaoSetor | string;

  @Column({ type: 'boolean', default: true })
  permitido: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
