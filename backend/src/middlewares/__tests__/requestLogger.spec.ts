import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLogger } from '../requestLogger';
import { logger } from '../../config/logger';

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('requestLogger - Correlation ID e Logging de Requisições', () => {
  let mockReq: any;
  let mockRes: any;
  let nextFn: any;
  let finishListeners: Array<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    finishListeners = [];

    mockReq = {
      method: 'GET',
      url: '/api/lotes',
      headers: {},
      ip: '127.0.0.1',
    };

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          finishListeners.push(callback);
        }
      }),
    };

    nextFn = vi.fn();
  });

  it('deve gerar um UUID aleatório caso a requisição não traga X-Request-ID', () => {
    requestLogger(mockReq, mockRes, nextFn);

    expect(mockReq.requestId).toBeDefined();
    expect(mockReq.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', mockReq.requestId);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('deve propagar o correlation ID quando informado no cabeçalho x-request-id', () => {
    mockReq.headers['x-request-id'] = 'custom-correlation-id-123';

    requestLogger(mockReq, mockRes, nextFn);

    expect(mockReq.requestId).toBe('custom-correlation-id-123');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'custom-correlation-id-123');
    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('deve registrar log com duração e status após finalização da resposta', () => {
    requestLogger(mockReq, mockRes, nextFn);

    // Simula término da requisição com 200 OK
    mockRes.statusCode = 200;
    for (const listener of finishListeners) {
      listener();
    }

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/api/lotes',
        statusCode: 200,
        durationMs: expect.any(Number),
        requestId: mockReq.requestId,
      }),
      expect.stringContaining('[HTTP] GET /api/lotes -> 200')
    );
  });

  it('deve registrar com logger.warn para respostas 4xx', () => {
    requestLogger(mockReq, mockRes, nextFn);

    mockRes.statusCode = 404;
    for (const listener of finishListeners) {
      listener();
    }

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      expect.stringContaining('-> 404')
    );
  });

  it('deve registrar com logger.error para respostas 5xx', () => {
    requestLogger(mockReq, mockRes, nextFn);

    mockRes.statusCode = 500;
    for (const listener of finishListeners) {
      listener();
    }

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
      expect.stringContaining('-> 500')
    );
  });
});
