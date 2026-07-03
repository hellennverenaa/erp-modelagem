import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AppDataSource } from './config/database';
import { corsOptions } from './config/cors';
import { globalLimiter, authLimiter, heavyLimiter } from './config/rateLimits';
import { swaggerSetup } from './config/swagger';
import apiRoutes from './routes';
import { errorHandler } from './middlewares/errorHandler';

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
app.use('/api', apiRoutes);

// ═══ CAMADA 8: TRATAMENTO DE ERROS CENTRALIZADO ═══
app.use(errorHandler);

// ═══ INICIALIZAÇÃO ═══
AppDataSource.initialize()
  .then(() => {
    console.log('📦 Banco de dados conectado com sucesso via TypeORM!');

    app.listen(port, () => {
      console.log(`🚀 Servidor ERP rodando com sucesso na porta ${port}`);
      console.log(`📖 Documentação Swagger disponível em: http://localhost:${port}/api-docs`);
      console.log(`🔒 Helmet, CORS e Rate Limiting ativos`);
    });
  })
  .catch((error) => {
    console.error('❌ Falha ao inicializar o banco de dados:', error);
    process.exit(1);
  });
