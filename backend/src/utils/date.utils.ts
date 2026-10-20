/**
 * Utilitários de manipulação, validação e normalização de datas e fusos horários.
 * TASK-019: Padronização de datas no backend e no banco de dados.
 */

/**
 * Expressão regular para validar o formato de data de calendário YYYY-MM-DD.
 */
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte e normaliza um valor de data de calendário (date-only) em objeto Date seguro.
 * Quando o valor for YYYY-MM-DD, a data é normalizada para o meio-dia UTC (12:00:00.000Z),
 * impedindo shifts de fuso horário (ex: recuo para o dia anterior no fuso UTC-3 do Brasil).
 *
 * @param value String no formato YYYY-MM-DD ou ISO, ou Date, ou null/undefined
 * @returns Date normalizado ou null
 */
export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value;
  }

  const str = String(value).trim();
  if (!str) return null;

  const match = str.match(DATE_ONLY_REGEX);
  if (match) {
    const [, ano, mes, dia] = match;
    // Meio-dia UTC evita mudança de data em qualquer fuso horário entre UTC-11 e UTC+11
    const isoString = `${ano}-${mes}-${dia}T12:00:00.000Z`;
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Converte e valida uma string ou Date em um instante estrito ISO UTC.
 * Retorna null se a data for inválida ou vazia.
 */
export function parseIsoTimestamp(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Extrai o valor de data de calendário no formato YYYY-MM-DD.
 * Preserva o dia informado ignorando distorções de fuso horário.
 *
 * @param value Date ou string ISO
 * @returns String YYYY-MM-DD ou null
 */
export function formatDateOnlyIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.trim().match(DATE_ONLY_REGEX);
    if (match) return match[0];

    const matchIso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) return matchIso[0];
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;

  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Validador Zod/custom para strings de data válidas (date-only ou ISO timestamp).
 */
export function isValidDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(new Date(trimmed).getTime());
}
