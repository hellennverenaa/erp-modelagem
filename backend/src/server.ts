import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { uploadDir } from './config/uploads';
import { createServer } from 'http';
import { AppDataSource } from './config/database';
import { corsOptions } from './config/cors';
import { globalLimiter, authLimiter, heavyLimiter } from './config/rateLimits';
import { swaggerSetup } from './config/swagger';
import apiRoutes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { webSocketService } from './services/websocket.service';

// ═══════════════════════════════════════════════════════════════════════════
// ERP Chão de Fábrica v4.0 — Servidor Principal
// ═══════════════════════════════════════════════════════════════════════════
// Cadeia de Middlewares (ordem crítica conforme Seção 10.1 do plano v4.0):
//   1. Helmet (headers de segurança)
//   2. CORS (whitelist de origens)
//   3. Rate Limiters (Global, Auth, Heavy)
//   4. Body Parser (JSON com limite de 10MB)
//   5. Swagger UI (documentação pública)
//   6. Rotas públicas (health, auth)
//   7. JWT + Rotas protegidas
//   8. Error Handler (sanitização centralizada)

const app = express();
const port = process.env.ERP_PORT || 3001;

// ═══ CAMADA 1: SEGURANÇA DE TRANSPORTE (Helmet) ═══
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// ═══ CAMADA 2: CORS (Whitelist de Origens do .env) ═══
app.use(cors(corsOptions));

// ═══ CAMADA 3: RATE LIMITING ═══
// Global: 200 req / 15 min para /api/*
app.use('/api/', globalLimiter);
// Auth: 5 tentativas / 15 min para login (brute-force protection)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
// Heavy: 10 operações / 1 hora para relatórios e dossiês
app.use('/api/relatorios/', heavyLimiter);
app.use('/api/dossies/', heavyLimiter);

// ═══ CAMADA 4: BODY PARSER ═══
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ═══ CAMADA 5: DOCUMENTAÇÃO SWAGGER (pública — sem JWT) ═══
swaggerSetup(app);

// ═══ CAMADA 6: ROTAS PÚBLICAS (sem JWT) ═══
// Health Check
app.get('/health', async (_req, res) => {
  try {
    if (!AppDataSource.isInitialized) throw new Error('Database is not initialized');
    await AppDataSource.query('SELECT 1');
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      database: 'CONNECTED',
      version: '4.0.0',
    });
  } catch {
    res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      database: 'DISCONNECTED',
      version: '4.0.0',
    });
  }
});

// ═══ CAMADA 7: ROTAS PROTEGIDAS (JWT obrigatório) ═══
// Serve arquivos de upload (fotos de ocorrências) com headers explícitos de CORS e CORP
// Necessário para evitar bloqueio OpaqueResponseBlocking do Helmet no Vite dev server (porta 5173)
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadDir));

app.use('/api', apiRoutes);
// O gateway remove /api/erp-modelagem antes de encaminhar ao ERP.
app.use('/', apiRoutes);

// ═══ CAMADA 8: TRATAMENTO DE ERROS CENTRALIZADO ═══
app.use(errorHandler);

// ═══ INICIALIZAÇÃO ═══
console.log('🔧 Verificando configurações de ambiente...');

const httpServer = createServer(app);

async function startServer(): Promise<void> {
  try {
    await AppDataSource.initialize();
    if (await AppDataSource.showMigrations()) {
      throw new Error('Há migrações pendentes. Execute npm run migration:run antes de iniciar o backend.');
    }
    console.log('📦 Banco de dados conectado com sucesso via TypeORM!');

    webSocketService.init(httpServer);
    httpServer.listen(port, () => {
      console.log(`🚀 Servidor ERP rodando com sucesso na porta ${port}`);
      console.log(`📖 Documentação Swagger disponível em: http://localhost:${port}/api-docs`);
      console.log('🔒 Helmet, CORS e Rate Limiting ativos');
    });
  } catch (error: any) {
    console.error('Não foi possível iniciar o backend: confirme o PostgreSQL, as migrações e as variáveis de ambiente.');
    console.error(error?.message || error);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy().catch(() => undefined);
    }
    process.exitCode = 1;
  }
}

void startServer();
