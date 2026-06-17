import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════════════
// Middleware de Autenticação JWT — Integração com dass_auth_service
// ═══════════════════════════════════════════════════════════════════════════
// Regra Inegociável: O JWT_SECRET é compartilhado com o dass_auth_service
// (porta 2399) para validar tokens emitidos pelo serviço legado.
// Conforme Seção 10.2 do implementation_plan_4.md

// ═══ Interface do Payload JWT ═══
export interface JwtPayload {
  userId: string;         // UUID do usuario
  perfilId: string;       // UUID do perfil (RBAC)
  perfilNome: string;     // Ex: 'REVISORA', 'COORDENADOR_SETOR'
  plantaId: string;       // UUID da planta de lotação
  setorId?: string;       // UUID do setor (opcional)
  nomeCompleto: string;   // Nome para exibição
  iss: string;            // 'erp-modelagem' ou 'dass-auth'
  aud: string;            // 'erp-modelagem-users'
  exp: number;            // Expiração
  iat: number;            // Emissão
}

// ═══ Extensão da interface Request do Express ═══
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ═══ Validação de Variável de Ambiente Crítica ═══
const JWT_SECRET: string = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET não definido nas variáveis de ambiente.');
}

/**
 * Middleware de verificação de token JWT.
 * Extrai o token do header Authorization: Bearer <TOKEN>,
 * valida a assinatura e injeta os dados decodificados em req.user.
 */
export function verificaToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({
      error: 'Token de acesso obrigatório.',
      code: 'AUTH_TOKEN_REQUIRED',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expirado. Utilize o refresh token.',
        code: 'AUTH_TOKEN_EXPIRED',
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(403).json({
        error: 'Token inválido.',
        code: 'AUTH_TOKEN_INVALID',
      });
      return;
    }

    res.status(500).json({
      error: 'Erro interno na verificação do token.',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
}
