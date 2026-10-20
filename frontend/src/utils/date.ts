/**
 * Utilitários padronizados para manipulação, formatação e inputs de data e hora.
 * TASK-020: Apresentação e edição de datas no frontend imunes a distorções de fuso horário.
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Formata um instante de tempo (timestamp) no fuso horário local do operador.
 * Exemplo: '2026-10-20T10:15:00.000Z' -> '20/10/2026, 07:15'
 */
export function formatDate(
  value: string | Date | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formata uma data de calendário (date-only, ex: previsão de corte) sem shift de fuso horário.
 * Se receber '2026-10-25', '2026-10-25T00:00:00Z' ou '2026-10-25T12:00:00Z',
 * sempre retornará '25/10/2026', independentemente do fuso horário do navegador.
 */
export function formatDateOnly(
  value: string | Date | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;

  if (typeof value === 'string') {
    const match = value.trim().match(DATE_ONLY_REGEX);
    if (match) {
      const [, ano, mes, dia] = match;
      return `${dia}/${mes}/${ano}`;
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;

  // Usa UTC para evitar quefusos negativos recuem para o dia anterior
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata instante de tempo no formato extenso: 'DD/MM/AAAA às HH:mm'.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;

  const dataStr = d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horaStr = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dataStr} às ${horaStr}`;
}

/**
 * Formata apenas a hora e minuto: 'HH:mm'.
 */
export function formatTimeOnly(
  value: string | Date | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;

  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Converte qualquer representação de data para o formato aceito por inputs HTML: 'YYYY-MM-DD'.
 * Imune a distorções de fuso horário.
 */
export function toDateInputValue(
  value: string | Date | null | undefined
): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const match = value.trim().match(DATE_ONLY_REGEX);
    if (match) return match[0];
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';

  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
