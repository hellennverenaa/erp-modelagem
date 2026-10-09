import { z } from 'zod';
import { TipoExecucao } from '../entities/RotaModelo';
import { modeloIdentificacaoSchema } from './modelo.schema';

const uuidSchema = z.string().uuid();

const etapaRotaSchema = z.object({
  setorId: uuidSchema,
  ordem: z.number().int().min(1),
  obrigatorio: z.boolean().default(true),
  tipoExecucao: z.nativeEnum(TipoExecucao).default(TipoExecucao.SEQUENCIAL),
  bipagemApenasSaida: z.boolean().default(false),
});

export const finalizarNovoTesteSchema = z.object({
  modelo: modeloIdentificacaoSchema,
  pecas: z.array(z.object({
    catalogoPecaId: uuidSchema,
    setorCorteOpcaoId: uuidSchema,
  })).min(1, 'Adicione ao menos uma peça ao modelo.'),
  rota: z.array(etapaRotaSchema).min(1, 'A rota deve conter ao menos um setor.'),
  ordem: z.object({
    plantaId: uuidSchema,
    prioridadePcp: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
    possuiCaixaTeste: z.boolean().default(false),
    observacoes: z.string().nullable().optional(),
    dataPrevistaProducao: z.string().nullable().optional().refine(
      (value) => value == null || Number.isFinite(new Date(value).getTime()),
      'Data prevista de produção inválida.',
    ),
    slasPorSetor: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  }),
}).superRefine((data, ctx) => {
  const catalogoIds = data.pecas.map((peca) => peca.catalogoPecaId);
  if (new Set(catalogoIds).size !== catalogoIds.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['pecas'],
      message: 'A mesma peça do catálogo não pode ser adicionada mais de uma vez.',
    });
  }
});

export type FinalizarNovoTesteInput = z.infer<typeof finalizarNovoTesteSchema>;
