import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Middleware de Correlation ID e logging estruturado de requisições HTTP.
 * 
 * Propaga ou gera um identificador único de rastreamento (X-Request-ID),
 * associa-o à requisição e calcula com precisão a latência de execução (durationMs).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim()) 
    ? incomingId.trim() 
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startHrTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endHrTime = process.hrtime.bigint();
    const durationMs = Number(endHrTime - startHrTime) / 1_000_000;
    const statusCode = res.statusCode;

    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip || req.socket.remoteAddress,
      userId: req.user?.userId || null,
    };

    if (statusCode >= 500) {
      logger.error(logData, `[HTTP] ${req.method} ${req.url} -> ${statusCode} (${durationMs.toFixed(1)}ms)`);
    } else if (statusCode >= 400) {
      logger.warn(logData, `[HTTP] ${req.method} ${req.url} -> ${statusCode} (${durationMs.toFixed(1)}ms)`);
    } else {
      logger.info(logData, `[HTTP] ${req.method} ${req.url} -> ${statusCode} (${durationMs.toFixed(1)}ms)`);
    }
  });

  next();
}
