import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Planta } from '../entities/Planta';
import { Setor } from '../entities/Setor';
import { EstacaoTrabalho } from '../entities/EstacaoTrabalho';
import { Perfil } from '../entities/Perfil';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';
import { Marca } from '../entities/Marca';
import { Modelo } from '../entities/Modelo';
import { Peca } from '../entities/Peca';
import { RotaModelo } from '../entities/RotaModelo';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Rastreamento } from '../entities/Rastreamento';
import { EtapaApoio } from '../entities/EtapaApoio';
import { EtapaCorte } from '../entities/EtapaCorte';
import { ChecklistTemplate } from '../entities/ChecklistTemplate';
import { ChecklistTemplateItem } from '../entities/ChecklistTemplateItem';
import { Checklist } from '../entities/Checklist';
import { ChecklistItem } from '../entities/ChecklistItem';
import { Inspecao } from '../entities/Inspecao';
import { InspecaoPeca } from '../entities/InspecaoPeca';
import { Divergencia } from '../entities/Divergencia';
import { Retrabalho } from '../entities/Retrabalho';
import { ConfigCategoria } from '../entities/ConfigCategoria';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { ValidacaoSetor } from '../entities/ValidacaoSetor';
import { AprovacaoFinal } from '../entities/AprovacaoFinal';
import { Email } from '../entities/Email';
import { Anexo } from '../entities/Anexo';
import { AuditLog } from '../entities/AuditLog';
import { InsightQualidade } from '../entities/InsightQualidade';
import { OcorrenciaProducao } from '../entities/OcorrenciaProducao';
import { DossieModelo } from '../entities/DossieModelo';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'erp_modelagem',
  schema: process.env.DB_SCHEMA || 'public',
  // Sincronização automática em ambiente de desenvolvimento (útil para testes iniciais)
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Planta,
    Setor,
    EstacaoTrabalho,
    Perfil,
    PerfilPermissao,
    Usuario,
    Marca,
    Modelo,
    Peca,
    RotaModelo,
    OrdemTeste,
    Rastreamento,
    EtapaApoio,
    EtapaCorte,
    ChecklistTemplate,
    ChecklistTemplateItem,
    Checklist,
    ChecklistItem,
    Inspecao,
    InspecaoPeca,
    Divergencia,
    Retrabalho,
    ConfigCategoria,
    ConfigOpcao,
    ValidacaoSetor,
    AprovacaoFinal,
    Email,
    Anexo,
    AuditLog,
    InsightQualidade,
    OcorrenciaProducao,
    DossieModelo
  ],
  migrations: [__dirname + '/../migrations/**/*.{js,ts}'],
  subscribers: [],
});
