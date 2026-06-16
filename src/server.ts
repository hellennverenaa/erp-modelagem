import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppDataSource } from './config/database';

const app = express();
const port = process.env.ERP_PORT || 3001;

// Middlewares globais de segurança
app.use(helmet());

// CORS Dinâmico com base no arquivo .env
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Limitação de Requisições Global (Rate Limiter)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP por janela
  message: {
    erro: 'Muitas requisições originadas deste IP, por favor tente novamente mais tarde.'
  }
});
app.use(limiter);

// Rota de Teste de Saúde (Health Check)
app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    database: AppDataSource.isInitialized ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// Inicialização da Conexão do TypeORM e Servidor Express
AppDataSource.initialize()
  .then(() => {
    console.log('📦 Banco de dados conectado com sucesso via TypeORM!');
    
    app.listen(port, () => {
      console.log(`🚀 Servidor ERP rodando com sucesso na porta ${port}`);
    });
  })
  .catch((error) => {
    console.error('❌ Falha ao inicializar o banco de dados:', error);
    process.exit(1);
  });
