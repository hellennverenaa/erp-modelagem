import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Planta } from '../entities/Planta';
import { Setor } from '../entities/Setor';
import { EstacaoTrabalho } from '../entities/EstacaoTrabalho';
import { Perfil } from '../entities/Perfil';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'erp_modelagem',
  // Sincronização automática em ambiente de desenvolvimento (útil para testes iniciais)
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Planta,
    Setor,
    EstacaoTrabalho,
    Perfil,
    PerfilPermissao,
    Usuario
  ],
  migrations: [],
  subscribers: [],
});
