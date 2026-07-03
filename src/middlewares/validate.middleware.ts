import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Middleware de Validação com Zod — Validação de Entrada Obrigatória
// ═══════════════════════════════════════════════════════════════════════════
// Conforme Seção 10.5 do implementation_plan_4.md
// Toda entrada da API (body, params, query) é validada com Zod antes de
// chegar ao controller. Nenhum dado não-validado deve tocar o banco de dados.

import { ZodSchema } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Middleware de validação de request usando schemas Zod.
 * Valida body, params e query separadamente.
 */
export function validarRequest(schema: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema.body) schema.body.parse(req.body);
      if (schema.params) schema.params.parse(req.params);
      if (schema.query) schema.query.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Erro de validação nos dados enviados.',
          code: 'VALIDATION_ERROR',
          details: error.issues.map((e) => ({
            campo: e.path.map(String).join('.'),
            mensagem: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}
