import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env'),
});

const schema = 'erp_modelagem';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL não configurada.');
}
const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.delete('schema');
const client = new Client({ connectionString: connectionUrl.toString() });

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
