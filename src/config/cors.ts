import { CorsOptions } from 'cors';

// ═══════════════════════════════════════════════════════════════════════════
// Configuração CORS — Whitelist Dinâmica via Variáveis de Ambiente
// ═══════════════════════════════════════════════════════════════════════════
// Regra Inegociável: CORS com credentials: true proíbe origin: '*'.
// A whitelist é lida de CORS_ALLOWED_ORIGINS no .env (vírgula-separada).

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Fallback para desenvolvimento local
if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS.push(
    'http://localhost:5173',   // Vite dev server (Vue.js)
    'http://localhost:3000',   // Alternativo
  );
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Permitir requisições sem origin (Postman, curl, health checks internos)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem ${origin} não autorizada pela política de CORS.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // Preflight cache: 24h
};
