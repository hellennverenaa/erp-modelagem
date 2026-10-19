import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarcaService, MarcaServiceError } from '../marca.service';
import { AppDataSource } from '../../config/database';
import { Marca } from '../../entities/Marca';

vi.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: vi.fn(),
  },
}));

describe('MarcaService - Normalização, Validação e Gestão de Marcas', () => {
  let mockMarcaRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMarcaRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn((data: any) => ({ ...data, id: 'marca-id' })),
      save: vi.fn((data: any) => Promise.resolve(data)),
    };

    (AppDataSource.getRepository as any).mockImplementation((entity: any) => {
      if (entity === Marca) return mockMarcaRepo;
      throw new Error(`Repositório não mockado: ${entity.name}`);
    });
  });

  describe('normalização e comparação de nomes', () => {
    it('deve normalizar espaços múltiplos e bordas', () => {
      expect(MarcaService.normalizarNome('   Nike    Air   ')).toBe('Nike Air');
    });

    it('deve comparar marcas de forma case-insensitive respeitando pt-BR', () => {
      expect(MarcaService.nomesIguais('FILA', 'fila')).toBe(true);
      expect(MarcaService.nomesIguais('São Paulo', 'são paulo')).toBe(true);
      expect(MarcaService.nomesIguais('Adidas', 'Puma')).toBe(false);
    });
  });

  describe('criarMarca', () => {
    it('deve impedir cadastro de marca duplicada ignorando caixa e espaços', async () => {
      mockMarcaRepo.find.mockResolvedValueOnce([{ id: 'm-1', nome: 'NIKE' }]);

      await expect(MarcaService.criarMarca('   nike   '))
        .rejects
        .toThrow(new MarcaServiceError('Já existe uma marca com esse nome.', 409, 'MARCA_DUPLICATE_NAME'));
    });

    it('deve cadastrar nova marca quando nome for inédito', async () => {
      mockMarcaRepo.find.mockResolvedValueOnce([{ id: 'm-1', nome: 'NIKE' }]);

      const nova = await MarcaService.criarMarca('Adidas');
      expect(nova.nome).toBe('Adidas');
      expect(nova.ativo).toBe(true);
    });
  });

  describe('atualizarMarca', () => {
    it('deve retornar 404 para marca inexistente', async () => {
      mockMarcaRepo.findOne.mockResolvedValueOnce(null);

      await expect(MarcaService.atualizarMarca('marca-inexistente', { nome: 'Nova' }))
        .rejects
        .toThrow(new MarcaServiceError('Marca não encontrada.', 404, 'MARCA_NOT_FOUND'));
    });

    it('deve impedir renomear marca para um nome já utilizado por outra marca', async () => {
      mockMarcaRepo.findOne.mockResolvedValueOnce({ id: 'm-1', nome: 'Fila Original', ativo: true });
      mockMarcaRepo.find.mockResolvedValueOnce([
        { id: 'm-1', nome: 'Fila Original' },
        { id: 'm-2', nome: 'Olympikus' },
      ]);

      await expect(MarcaService.atualizarMarca('m-1', { nome: 'Olympikus' }))
        .rejects
        .toThrow(new MarcaServiceError('Já existe uma marca com esse nome.', 409, 'MARCA_DUPLICATE_NAME'));
    });
  });
});
