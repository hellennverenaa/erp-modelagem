import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Swagger UI precisa de inline styles
      scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI precisa de inline scripts
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: { action: 'deny' },         // Anti-clickjacking
  hidePoweredBy: true,                     // Oculta X-Powered-By
  noSniff: true,                           // Anti MIME-sniffing
  hsts: {
    maxAge: 31536000,                      // 1 ano
    includeSubDomains: true,
    preload: true,
  },
}));

// ═══ CAMADA 2: CORS (Whitelist de Origens do .env) ═══
app.use(cors(corsOptions));

// ═══ CAMADA 3: RATE LIMITING ═══
// Global: 200 req / 15 min para /api/*
app.use('/api/', globalLimiter);
// Auth: 5 tentativas / 15 min para login (brute-force protection)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
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
app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    database: AppDataSource.isInitialized ? 'CONNECTED' : 'DISCONNECTED',
    version: '4.0.0',
  });
});

// ═══ CAMADA 7: ROTAS PROTEGIDAS (JWT obrigatório) ═══
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', apiRoutes);

// ═══ CAMADA 8: TRATAMENTO DE ERROS CENTRALIZADO ═══
app.use(errorHandler);

// ═══ INICIALIZAÇÃO ═══
console.log('🔧 Verificando configurações de ambiente...');
console.log(`🔌 Banco de Dados - Host: ${process.env.DB_HOST || 'localhost'} | Porta: ${process.env.DB_PORT || 5432}`);
console.log(`🔌 Redis Cache - Host: ${process.env.REDIS_HOST || 'Não configurado'}`);

const httpServer = createServer(app);
webSocketService.init(httpServer);

// Inicializa o servidor Express primeiro (Garante que a aplicação esteja de pé para responder diagnósticos)
httpServer.listen(port, () => {
  console.log(`🚀 Servidor ERP rodando com sucesso na porta ${port}`);
  console.log(`📖 Documentação Swagger disponível em: http://localhost:${port}/api-docs`);
  console.log(`🔒 Helmet, CORS e Rate Limiting ativos`);
});

// Inicialização do banco de dados assíncrona com tratamento fail-safe
AppDataSource.initialize()
  .then(() => {
    console.log('📦 Banco de dados conectado com sucesso via TypeORM!');
  })
  .catch((error) => {
    console.error('\n********************************************************************************');
    console.error('❌ ERRO CRÍTICO: Falha ao conectar no PostgreSQL. Verifique se o DB_HOST no .env está apontando para "erp-postgres" ou "host.docker.internal" e não para localhost.');
    console.error(`🔌 Host de destino configurado: ${process.env.DB_HOST || 'localhost'}`);
    console.error('💡 Dica: Verifique se o serviço do banco de dados PostgreSQL está rodando e a porta está aberta.');
    console.error('Detalhes do erro:', error.message || error);
    console.error('********************************************************************************\n');
    // Não matamos o processo para permitir diagnóstico via rota de /health
  });
