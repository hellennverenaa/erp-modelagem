import { describe, it, expect } from 'vitest';
import { parseDateOnly, parseIsoTimestamp, formatDateOnlyIso, isValidDateString } from '../date.utils';

describe('date.utils - Normalização de Datas e Timezones (TASK-019)', () => {
  describe('parseDateOnly', () => {
    it('deve normalizar data de calendário YYYY-MM-DD para meio-dia UTC sem recuar dia', () => {
      const result = parseDateOnly('2026-10-25');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-10-25T12:00:00.000Z');
      expect(result?.getUTCDate()).toBe(25);
      expect(result?.getUTCMonth()).toBe(9); // 0-indexed (9 = Outubro)
      expect(result?.getUTCFullYear()).toBe(2026);
    });

    it('deve aceitar objeto Date existente', () => {
      const input = new Date('2026-12-01T15:30:00.000Z');
      const result = parseDateOnly(input);
      expect(result).toEqual(input);
    });

    it('deve retornar null para valores nulos, vazios ou inválidos', () => {
      expect(parseDateOnly(null)).toBeNull();
      expect(parseDateOnly(undefined)).toBeNull();
      expect(parseDateOnly('')).toBeNull();
      expect(parseDateOnly('data-invalida')).toBeNull();
    });
  });

  describe('parseIsoTimestamp', () => {
    it('deve converter string ISO válida para Date correto', () => {
      const iso = '2026-10-20T10:15:30.000Z';
      const result = parseIsoTimestamp(iso);
      expect(result).not.toBeNull();
      expect(result?.getTime()).toBe(new Date(iso).getTime());
    });

    it('deve retornar null para strings inválidas', () => {
      expect(parseIsoTimestamp('invalido')).toBeNull();
      expect(parseIsoTimestamp(null)).toBeNull();
    });
  });

  describe('formatDateOnlyIso', () => {
    it('deve extrair YYYY-MM-DD de uma string date-only diretamente', () => {
      expect(formatDateOnlyIso('2026-10-25')).toBe('2026-10-25');
    });

    it('deve extrair YYYY-MM-DD de um timestamp ISO sem shift de fuso horário', () => {
      expect(formatDateOnlyIso('2026-10-25T12:00:00.000Z')).toBe('2026-10-25');
      expect(formatDateOnlyIso('2026-10-25T00:00:00.000Z')).toBe('2026-10-25');
    });

    it('deve retornar null para entradas nulas ou inválidas', () => {
      expect(formatDateOnlyIso(null)).toBeNull();
      expect(formatDateOnlyIso('abc')).toBeNull();
    });
  });

  describe('isValidDateString', () => {
    it('deve validar datas no formato YYYY-MM-DD e ISO', () => {
      expect(isValidDateString('2026-10-25')).toBe(true);
      expect(isValidDateString('2026-10-20T14:00:00.000Z')).toBe(true);
      expect(isValidDateString('invalido')).toBe(false);
      expect(isValidDateString('')).toBe(false);
      expect(isValidDateString(null)).toBe(false);
    });
  });
});
