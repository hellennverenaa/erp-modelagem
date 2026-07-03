import rateLimit from 'express-rate-limit';

// ═══════════════════════════════════════════════════════════════════════════
// Rate Limiting por Camada — 3 Níveis de Proteção
// ═══════════════════════════════════════════════════════════════════════════
// Conforme Seção 10.4 do implementation_plan_4.md

// ═══ CAMADA GLOBAL ═══
// Protege todos os endpoints /api/*
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutos
  max: 200,                        // 200 requisições por janela
  standardHeaders: true,           // RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: {
    error: 'Limite de requisições excedido. Tente novamente em 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 900,
  },
});

// ═══ CAMADA DE AUTENTICAÇÃO ═══
// Protege login e registro contra brute-force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutos
  max: 5,                          // Apenas 5 tentativas de login
  skipSuccessfulRequests: true,    // Não conta logins bem-sucedidos
  message: {
    error: 'Muitas tentativas de login. Conta temporariamente bloqueada por 15 minutos.',
    code: 'AUTH_RATE_LIMIT',
    retryAfter: 900,
  },
});

// ═══ CAMADA DE OPERAÇÕES PESADAS ═══
// Protege geração de relatórios, dossiês e exports
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,       // 1 hora
  max: 10,                         // 10 operações pesadas por hora
  message: {
    error: 'Limite de operações pesadas excedido. Tente novamente em 1 hora.',
    code: 'HEAVY_OP_RATE_LIMIT',
    retryAfter: 3600,
  },
});
