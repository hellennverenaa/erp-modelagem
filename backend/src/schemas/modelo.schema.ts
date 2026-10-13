import { z } from 'zod';

export const codigoProdutoSchema = z
  .string()
  .trim()
  .min(1, 'Código do produto é obrigatório.')
  .max(50, 'Código do produto deve ter no máximo 50 caracteres.')
  .regex(/^[0-9]+$/, 'Código do produto deve conter somente números.');

export const modeloIdentificacaoSchema = z.object({
  marcaId: z.string().uuid({ message: 'marcaId deve ser um UUID válido.' }),
  codigoProduto: codigoProdutoSchema,
  nome: z.string().trim().min(1, 'Nome do modelo é obrigatório.').max(150),
});
