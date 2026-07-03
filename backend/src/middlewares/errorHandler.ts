import { Request, Response, NextFunction } from 'express';
import './auth.middleware'; // Garante que a augmentação global de Express.Request.user está carregada

// ═══════════════════════════════════════════════════════════════════════════
// Middleware de Tratamento de Erros Centralizado
// ═══════════════════════════════════════════════════════════════════════════
// Conforme Seção 10.7 do implementation_plan_4.md
// Regra: NUNCA expor stack traces, nomes de tabelas ou detalhes internos
// do banco de dados em produção. Sanitizar todas as mensagens de erro.

/**
 * Handler centralizado de erros do Express.
 * Captura todos os erros não tratados e retorna respostas HTTP seguras e sanitizadas.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log interno completo (visível apenas no servidor)
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userId: req.user?.userId,
    ip: req.ip,
  });

  // ═══ Erro de CORS ═══
  if (err.message?.includes('CORS')) {
    res.status(403).json({
      error: 'Origem não autorizada.',
      code: 'CORS_REJECTED',
    });
    return;
  }

  // ═══ Erro de Validação Zod (safety net — já tratado no validate.middleware) ═══
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Dados de entrada inválidos.',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  // ═══ Erro de Sintaxe JSON (body malformado) ═══
  if (err.name === 'SyntaxError' && 'body' in err) {
    res.status(400).json({
      error: 'Corpo da requisição contém JSON inválido.',
      code: 'INVALID_JSON',
    });
    return;
  }

  // ═══ Erro Genérico (sanitizado para produção) ═══
  const statusCode = 'statusCode' in err ? (err as Error & { statusCode: number }).statusCode : 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Erro interno do servidor. Contate o administrador.',
    code: 'INTERNAL_ERROR',
    // NÃO enviar: err.stack, nomes de tabelas, queries SQL
  });
}
