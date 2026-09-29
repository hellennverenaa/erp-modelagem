import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env'),
});

const schema = process.env.DB_SCHEMA || 'erp_modelagem';
const databaseUrl = process.env.DATABASE_URL;
const client = new Client(
  databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS,
        database: process.env.DB_NAME || 'postgres',
      },
);

async function prepareDatabase() {
  await client.connect();
  try {
    const safeSchema = schema.replace(/"/g, '""');
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${safeSchema}"`);
    // Em um banco novo, instala a extensão no schema do ERP. Se ela já existir
    // no banco (como no clone local atual), o PostgreSQL não altera nada.
    await client.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "${safeSchema}"`,
    );
    console.log(`Banco preparado: schema ${schema}`);
  } finally {
    await client.end();
  }
}

prepareDatabase().catch((error) => {
  console.error('Não foi possível preparar o banco local.', error.message);
  process.exitCode = 1;
});
