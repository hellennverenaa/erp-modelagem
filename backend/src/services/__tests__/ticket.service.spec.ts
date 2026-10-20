import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketService, TicketServiceError } from '../ticket.service';
import { AppDataSource } from '../../config/database';
import { OrdemTeste } from '../../entities/OrdemTeste';
import { TicketSetor } from '../../entities/TicketSetor';

vi.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../ticket-setor.service', () => ({
  garantirTicketsSetorDaOrdem: vi.fn(),
}));

describe('TicketService - Regras de Gestão e Resolução de Tickets por Setor', () => {
  let mockOrdemRepo: any;
  let mockTicketRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrdemRepo = {
      findOne: vi.fn(),
    };

    mockTicketRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    (AppDataSource.getRepository as any).mockImplementation((entity: any) => {
      if (entity === OrdemTeste) return mockOrdemRepo;
      if (entity === TicketSetor) return mockTicketRepo;
      throw new Error(`Repositório não mockado: ${entity.name}`);
    });
  });

  describe('obterTicketsOrdem', () => {
    it('deve rejeitar UUID inválido com código LOTE_ID_INVALIDO', async () => {
      await expect(TicketService.obterTicketsOrdem('id-invalido', 'planta-1'))
        .rejects
        .toThrow(new TicketServiceError('ID da ordem inválido.', 400, 'LOTE_ID_INVALIDO'));
    });

    it('deve rejeitar usuário sem planta quando não tiver acesso a todas as plantas', async () => {
      const validUuid = '11111111-1111-4111-8111-111111111111';
      await expect(TicketService.obterTicketsOrdem(validUuid, undefined, false))
        .rejects
        .toThrow(new TicketServiceError('Usuário sem planta associada.', 403, 'PLANTA_REQUIRED'));
    });

    it('deve rejeitar se ordem não existir no banco (404)', async () => {
      const validUuid = '11111111-1111-4111-8111-111111111111';
      mockOrdemRepo.findOne.mockResolvedValueOnce(null);

      await expect(TicketService.obterTicketsOrdem(validUuid, 'planta-1', false))
        .rejects
        .toThrow(new TicketServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND'));
    });

    it('deve retornar tickets ordenados por etapa e snapshot de rota', async () => {
      const validUuid = '11111111-1111-4111-8111-111111111111';
      const ordemMock = {
        id: validUuid,
        codigoBarras: 'OT-TESTE-123',
        modelo: { nome: 'Tênis Running Pro' },
        rotaSnapshot: {
          versao: 1,
          etapas: [{ setorId: 'setor-1', nome: 'Corte' }],
        },
      };

      const ticketsMock = [
        {
          id: 'ticket-1',
          codigoBarras: 'TKT-001',
          setorId: 'setor-1',
          tipoLote: 'LOTE_PRINCIPAL',
          ordemEtapa: 1,
          rotaVersao: 1,
          setorNomeSnapshot: 'Corte',
          setor: { ativo: true },
        },
      ];

      mockOrdemRepo.findOne.mockResolvedValueOnce(ordemMock);
      mockTicketRepo.find.mockResolvedValueOnce(ticketsMock);
      (AppDataSource.transaction as any).mockImplementation(async (cb: any) => cb({}));

      const resultado = await TicketService.obterTicketsOrdem(validUuid, 'planta-1', false);

      expect(resultado.ordemTesteId).toBe(validUuid);
      expect(resultado.codigoBarras).toBe('OT-TESTE-123');
      expect(resultado.modeloNome).toBe('Tênis Running Pro');
      expect(resultado.rotaCongelada).toBe(true);
      expect(resultado.tickets).toHaveLength(1);
      expect(resultado.tickets[0].codigoBarras).toBe('TKT-001');
      expect(resultado.tickets[0].setorId).toBe('setor-1');
    });
  });

  describe('obterTicketPorCodigo', () => {
    it('deve rejeitar código de ticket vazio', async () => {
      await expect(TicketService.obterTicketPorCodigo(''))
        .rejects
        .toThrow(new TicketServiceError('Código do ticket inválido.', 400, 'TICKET_CODIGO_INVALIDO'));
    });

    it('deve rejeitar ticket inexistente (404)', async () => {
      mockTicketRepo.findOne.mockResolvedValueOnce(null);

      await expect(TicketService.obterTicketPorCodigo('TKT-NAO-EXISTE', 'planta-1'))
        .rejects
        .toThrow(new TicketServiceError('Ticket de setor não encontrado.', 404, 'TICKET_SETOR_NOT_FOUND'));
    });

    it('deve rejeitar se o ticket for de Caixa Teste mas a ordem não possuir Caixa Teste ativa (409)', async () => {
      mockTicketRepo.findOne.mockResolvedValueOnce({
        id: 'tkt-cx-1',
        codigoBarras: 'TKT-CX-1',
        tipoLote: 'CAIXA_TESTE',
        setor: { ativo: true },
        ordemTeste: {
          plantaId: 'planta-1',
          possuiCaixaTeste: false,
        },
      });

      await expect(TicketService.obterTicketPorCodigo('TKT-CX-1', 'planta-1'))
        .rejects
        .toThrow(new TicketServiceError('A ordem não possui Caixa Teste ativa.', 409, 'CAIXA_TESTE_INATIVA'));
    });

    it('deve retornar DTO correto do ticket quando válido', async () => {
      mockTicketRepo.findOne.mockResolvedValueOnce({
        id: 'tkt-1',
        codigoBarras: 'TKT-VALIDO-1',
        ordemTesteId: 'ordem-1',
        setorId: 'setor-corte',
        setorNomeSnapshot: 'Corte Dublagem',
        setor: { ativo: true },
        tipoLote: 'LOTE_PRINCIPAL',
        ordemTeste: {
          plantaId: 'planta-1',
          codigoBarras: 'OT-123',
          status: 'EM_PRODUCAO',
          possuiCaixaTeste: true,
        },
      });

      const res = await TicketService.obterTicketPorCodigo('TKT-VALIDO-1', 'planta-1');

      expect(res.id).toBe('tkt-1');
      expect(res.codigoBarras).toBe('TKT-VALIDO-1');
      expect(res.ordemCodigoBarras).toBe('OT-123');
      expect(res.tipoLote).toBe('LOTE_PRINCIPAL');
      expect(res.setorNome).toBe('Corte Dublagem');
    });

    it('deve rejeitar ticket de setor inativo', async () => {
      mockTicketRepo.findOne.mockResolvedValueOnce({
        id: 'tkt-inativo',
        codigoBarras: 'TKT-INATIVO',
        ordemTesteId: 'ordem-1',
        setorId: 'setor-inativo',
        setorNomeSnapshot: 'Setor antigo',
        setor: { ativo: false },
        tipoLote: 'LOTE_PRINCIPAL',
        ordemTeste: {
          plantaId: 'planta-1',
          codigoBarras: 'OT-123',
          status: 'EM_PRODUCAO',
          possuiCaixaTeste: true,
        },
      });

      await expect(TicketService.obterTicketPorCodigo('TKT-INATIVO', 'planta-1'))
        .rejects
        .toThrow(new TicketServiceError('Ticket de setor não encontrado.', 404, 'TICKET_SETOR_NOT_FOUND'));
    });
  });
});
