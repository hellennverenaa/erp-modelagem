import { AppDataSource } from '../config/database';
import { Marca } from '../entities/Marca';

export class MarcaServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'MARCA_ERROR'
  ) {
    super(message);
    this.name = 'MarcaServiceError';
  }
}

export class MarcaService {
  public static normalizarNome(nome: string): string {
    return nome.trim().replace(/\s+/g, ' ');
  }

  public static nomesIguais(a: string, b: string): boolean {
    return this.normalizarNome(a).toLocaleLowerCase('pt-BR') === this.normalizarNome(b).toLocaleLowerCase('pt-BR');
  }

  /**
   * Lista marcas cadastradas.
   */
  public static async listarMarcas(apenasAtivas = false): Promise<Marca[]> {
    const marcaRepo = AppDataSource.getRepository(Marca);
    return await marcaRepo.find({
      where: apenasAtivas ? { ativo: true } : {},
      order: { nome: 'ASC' },
    });
  }

  /**
   * Cria uma nova marca com verificação case-insensitive de duplicidade.
   */
  public static async criarMarca(nomeRaw: string): Promise<Marca> {
    const nome = this.normalizarNome(nomeRaw);
    const marcaRepo = AppDataSource.getRepository(Marca);
    const existentes = await marcaRepo.find({ select: { id: true, nome: true } });

    if (existentes.some((m) => this.nomesIguais(m.nome, nome))) {
      throw new MarcaServiceError('Já existe uma marca com esse nome.', 409, 'MARCA_DUPLICATE_NAME');
    }

    const marca = marcaRepo.create({ nome, ativo: true });
    return await marcaRepo.save(marca);
  }

  /**
   * Atualiza dados de uma marca existente (nome ou ativação).
   */
  public static async atualizarMarca(
    id: string,
    dados: { nome?: string; ativo?: boolean }
  ): Promise<Marca> {
    const marcaRepo = AppDataSource.getRepository(Marca);
    const marca = await marcaRepo.findOne({ where: { id } });
    if (!marca) {
      throw new MarcaServiceError('Marca não encontrada.', 404, 'MARCA_NOT_FOUND');
    }

    if (dados.nome !== undefined) {
      const nome = this.normalizarNome(dados.nome);
      const existentes = await marcaRepo.find({ select: { id: true, nome: true } });
      if (existentes.some((outra) => outra.id !== marca.id && this.nomesIguais(outra.nome, nome))) {
        throw new MarcaServiceError('Já existe uma marca com esse nome.', 409, 'MARCA_DUPLICATE_NAME');
      }
      marca.nome = nome;
    }

    if (dados.ativo !== undefined) {
      marca.ativo = dados.ativo;
    }

    return await marcaRepo.save(marca);
  }
}
