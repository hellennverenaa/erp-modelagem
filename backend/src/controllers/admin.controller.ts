import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { Setor } from '../entities/Setor';
import { Modelo } from '../entities/Modelo';
import { Planta } from '../entities/Planta';
import { Marca } from '../entities/Marca';
import { EntityManager, In, IsNull } from 'typeorm';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Peca } from '../entities/Peca';
import { ehUsuarioAdminAutomacao, PERFIL_ADMIN_AUTOMACAO } from '../config/rbac.constants';
import { carregarCatalogoRbac } from '../services/rbac-catalog.service';
import { AuditLog } from '../entities/AuditLog';

async function auditarRbac(manager: EntityManager, req: Request, acao: string, entidadeTipo: string, entidadeId: string, anteriores: Record<string, unknown> | null, novos: Record<string, unknown> | null) {
  await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
    usuarioId: req.user?.userId || null,
    acao,
    entidadeTipo,
    entidadeId,
    dadosAnteriores: anteriores,
    dadosNovos: novos,
    ipAddress: req.ip || null,
  }));
}

// ─── Schema de validação para criação de Modelo ─────────────────────────────
const createModeloSchema = z.object({
  marcaId:       z.string().uuid({ message: 'marcaId deve ser um UUID válido.' }),
  codigoProduto: z.string().min(1).max(50),
  nome:          z.string().min(1).max(150),
  temporada:     z.string().max(50).optional().nullable(),
  dataCorte:     z.string().optional().nullable(),
  mfmReferenciaUrl: z.string().url().optional().nullable(),
  fichaTecnicaUrl:  z.string().url().optional().nullable(),
  pecas: z.array(
    z.object({
      id: z.string().optional(),
      numero: z.string().optional(),
      nome: z.string(),
      codigoOriginal: z.string().optional().nullable(),
      setorCorteOpcaoId: z.string().optional().nullable(),
      descricao: z.string().optional().nullable(),
    })
  ).optional(),
});

const createMarcaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome da marca é obrigatório.').max(100, 'O nome da marca deve ter no máximo 100 caracteres.'),
});

const createPerfilSchema = z.object({
  nome: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(50),
  descricao: z.string().trim().max(500).optional().nullable(),
});

const updatePerfilSchema = z.object({
  nome: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(50).optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
}).refine((data) => data.nome !== undefined || data.descricao !== undefined || data.ativo !== undefined, {
  message: 'Informe ao menos um campo para atualizar.',
});

const updateMarcaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome da marca é obrigatório.').max(100, 'O nome da marca deve ter no máximo 100 caracteres.').optional(),
  ativo: z.boolean().optional(),
}).refine((data) => data.nome !== undefined || data.ativo !== undefined, {
  message: 'Informe o nome ou o status da marca para atualizar.',
});

function normalizarNomeMarca(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

function nomesDeMarcaIguais(a: string, b: string): boolean {
  return normalizarNomeMarca(a).toLocaleLowerCase('pt-BR') === normalizarNomeMarca(b).toLocaleLowerCase('pt-BR');
}

export class AdminController {
  /**
   * Lista todos os perfis cadastrados no sistema.
   */
  public async getPerfis(_req: Request, res: Response): Promise<Response> {
    try {
      const perfilRepo = AppDataSource.getRepository(Perfil);
      const perfis = await perfilRepo.find({
        order: { nome: 'ASC' }
      });
      return res.json(perfis);
    } catch (error) {
      console.error('[AdminController] Erro ao listar perfis:', error);
      return res.status(500).json({ error: 'Erro ao listar perfis' });
    }
  }

  /** Cria um perfil de acesso sem associá-lo a um cargo. */
  public async createPerfil(req: Request, res: Response): Promise<Response> {
    const parsed = createPerfilSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos para o perfil.',
        code: 'PERFIL_VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const perfilRepo = AppDataSource.getRepository(Perfil);
      const nome = parsed.data.nome.replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
      if (['ADMIN', 'ADMIN_AUTOMACAO'].includes(nome)) {
        return res.status(409).json({
          error: 'Esse nome é reservado a um perfil de sistema.',
          code: 'PERFIL_SYSTEM_NAME_RESERVED',
        });
      }
      const existente = await perfilRepo.findOne({ where: { nome } });
      if (existente) {
        return res.status(409).json({
          error: 'Já existe um perfil com esse nome.',
          code: 'PERFIL_DUPLICATE_NAME',
        });
      }

      const perfil = perfilRepo.create({
        nome,
        descricao: parsed.data.descricao?.trim() || null,
        permissoes: {},
        ativo: true,
      });
      const salvo = await AppDataSource.transaction(async (manager) => {
        const criado = await manager.getRepository(Perfil).save(perfil);
        await auditarRbac(manager, req, 'RBAC_PERFIL_CRIADO', 'perfis', criado.id, null, { nome: criado.nome, descricao: criado.descricao, ativo: criado.ativo });
        return criado;
      });
      return res.status(201).json(salvo);
    } catch (error) {
      console.error('[AdminController] Erro ao criar perfil:', error);
      return res.status(500).json({ error: 'Erro ao criar perfil.' });
    }
  }

  /** Atualiza dados do perfil ou o desativa sem apagar seu histórico. */
  public async updatePerfil(req: Request, res: Response): Promise<Response> {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Identificador de perfil inválido.', code: 'PERFIL_ID_INVALID' });
    }

    const parsed = updatePerfilSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos para o perfil.',
        code: 'PERFIL_VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const perfilRepo = AppDataSource.getRepository(Perfil);
      const perfil = await perfilRepo.findOne({ where: { id: id.data } });
      if (!perfil) {
        return res.status(404).json({ error: 'Perfil não encontrado.', code: 'PERFIL_NOT_FOUND' });
      }

      if (['ADMIN', 'VISUALIZADOR', PERFIL_ADMIN_AUTOMACAO].includes(perfil.nome) && (
        (parsed.data.nome !== undefined && parsed.data.nome.trim().toLocaleUpperCase('pt-BR') !== perfil.nome) ||
        parsed.data.ativo === false
      )) {
        return res.status(409).json({
          error: `O perfil ${perfil.nome} é protegido e não pode ser renomeado ou desativado.`,
          code: 'PERFIL_SYSTEM_PROTECTED',
        });
      }

      const anteriores = { nome: perfil.nome, descricao: perfil.descricao, ativo: perfil.ativo };
      if (parsed.data.nome !== undefined) {
        const nome = parsed.data.nome.replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
        if (['ADMIN', 'ADMIN_AUTOMACAO', 'VISUALIZADOR'].includes(nome) && nome !== perfil.nome) {
          return res.status(409).json({
            error: 'Esse nome é reservado a um perfil de sistema.',
            code: 'PERFIL_SYSTEM_NAME_RESERVED',
          });
        }
        const duplicado = await perfilRepo.findOne({ where: { nome } });
        if (duplicado && duplicado.id !== perfil.id) {
          return res.status(409).json({ error: 'Já existe um perfil com esse nome.', code: 'PERFIL_DUPLICATE_NAME' });
        }
        perfil.nome = nome;
      }

      if (parsed.data.descricao !== undefined) {
        perfil.descricao = parsed.data.descricao?.trim() || null;
      }

      if (parsed.data.ativo === false) {
        const usuariosAssociados = await AppDataSource.getRepository(Usuario).count({ where: { perfilId: perfil.id } });
        if (usuariosAssociados > 0) {
          return res.status(409).json({
            error: 'Reatribua os usuários deste perfil antes de desativá-lo.',
            code: 'PERFIL_HAS_USERS',
          });
        }
      }

      if (parsed.data.ativo !== undefined) {
        perfil.ativo = parsed.data.ativo;
      }

      const salvo = await AppDataSource.transaction(async (manager) => {
        const atualizado = await manager.getRepository(Perfil).save(perfil);
        const novos = { nome: atualizado.nome, descricao: atualizado.descricao, ativo: atualizado.ativo };
        if (JSON.stringify(anteriores) !== JSON.stringify(novos)) {
          await auditarRbac(manager, req, 'RBAC_PERFIL_ATUALIZADO', 'perfis', atualizado.id, anteriores, novos);
        }
        return atualizado;
      });
      return res.json(salvo);
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar perfil:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil.' });
    }
  }

  /**
   * Lista todos os setores cadastrados no sistema.
   * Inclui tipoOpcaoValor (config_opcoes.valor) para o frontend realizar
   * análise dinâmica do tipo do setor sem UUIDs hardcoded.
   */
  public async getSetores(_req: Request, res: Response): Promise<Response> {
    try {
      const setorRepo = AppDataSource.getRepository(Setor);
      const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);

      const setores = await setorRepo.find({
        where: { ativo: true },
        order: { ordemFluxo: 'ASC' }
      });

      // Enriquece cada setor com o valor da config_opcao (ex: 'ALMOXARIFADO')
      const setoresEnriquecidos = await Promise.all(
        setores.map(async (s) => {
          const opcao = await configOpcaoRepo.findOne({ where: { id: s.tipoOpcaoId } });
          return {
            ...s,
            tipoOpcaoValor: opcao?.valor ?? null,  // 'ALMOXARIFADO', 'NAVALHA', etc.
            tipoOpcaoLabel: opcao?.label ?? null,
          };
        })
      );

      return res.json(setoresEnriquecidos);
    } catch (error) {
      console.error('[AdminController] Erro ao listar setores:', error);
      return res.status(500).json({ error: 'Erro ao listar setores' });
    }
  }

  /**
   * Lista todas as config_opcoes, filtradas opcionalmente por categoria.
   * Ex: GET /api/admin/config-opcoes?categoria=setor_tipo
   */
  public async getConfigOpcoes(req: Request, res: Response): Promise<Response> {
    try {
      const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);
      const { categoria } = req.query as { categoria?: string };

      let opcoes: ConfigOpcao[];
      if (categoria) {
        // Busca por join com ConfigCategoria via categoria.valor
        opcoes = await configOpcaoRepo
          .createQueryBuilder('co')
          .leftJoin('co.categoria', 'cat')
          .where('cat.valor = :categoria', { categoria })
          .andWhere('co.ativo = true')
          .orderBy('co.ordem', 'ASC')
          .getMany();
      } else {
        opcoes = await configOpcaoRepo.find({ where: { ativo: true }, order: { ordem: 'ASC' } });
      }

      return res.json(opcoes);
    } catch (error) {
      console.error('[AdminController] Erro ao listar config_opcoes:', error);
      return res.status(500).json({ error: 'Erro ao listar opções de configuração' });
    }
  }

  /**
   * Lista todos os modelos ativos SEM ordem de teste vinculada.
   * Regra de negócio 1:1: um modelo só pode ter UM teste de produção.
   * Este endpoint alimenta exclusivamente o dropdown da tela "Nova Ordem de Teste".
   */
  public async getModelos(_req: Request, res: Response): Promise<Response> {
    try {
      const modeloRepo = AppDataSource.getRepository(Modelo);

      // Subquery NOT EXISTS — exclui modelos que já possuem qualquer OrdemTeste
      const modelos = await modeloRepo
        .createQueryBuilder('m')
        .where('m.ativo = :ativo', { ativo: true })
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM erp_modelagem.ordens_teste ot WHERE ot.modelo_id = m.id)'
        )
        .leftJoinAndSelect('m.marca', 'marca')
        .orderBy('m.nome', 'ASC')
        .getMany();

      return res.json(modelos);
    } catch (error) {
      console.error('[AdminController] Erro ao listar modelos disponíveis:', error);
      return res.status(500).json({ error: 'Erro ao listar modelos' });
    }
  }

  /**
   * Lista TODOS os modelos ativos do catálogo (para a tela GestaoModelosView).
   * Inclui todos — com ou sem ordem de teste.
   */
  public async getAllModelos(_req: Request, res: Response): Promise<Response> {
    try {
      const modeloRepo = AppDataSource.getRepository(Modelo);
      const modelos = await modeloRepo
        .createQueryBuilder('m')
        .leftJoinAndSelect('m.marca', 'marca')
        .leftJoinAndSelect('m.pecas', 'pecas')
        .orderBy('m.nome', 'ASC')
        .getMany();
      return res.json(modelos);
    } catch (error) {
      console.error('[AdminController] Erro ao listar catálogo de modelos:', error);
      return res.status(500).json({ error: 'Erro ao listar catálogo de modelos' });
    }
  }

  /** Obtém os dados completos de um modelo usados na manutenção de uma ordem. */
  public async getModeloPorId(req: Request, res: Response): Promise<Response> {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Identificador de modelo inválido.', code: 'MODELO_ID_INVALID' });
    }

    try {
      const modelo = await AppDataSource.getRepository(Modelo).findOne({
        where: { id: id.data },
        relations: { marca: true, pecas: { setorCorteOpcao: true }, rotas: { setor: true } },
      });
      if (!modelo) {
        return res.status(404).json({ error: 'Modelo não encontrado.', code: 'MODELO_NOT_FOUND' });
      }
      return res.json(modelo);
    } catch (error) {
      console.error('[AdminController] Erro ao buscar modelo por identificador:', error);
      return res.status(500).json({ error: 'Erro ao buscar modelo.' });
    }
  }

  /**
   * Cria um novo modelo no catálogo.
   * POST /api/admin/modelos
   */
  public async createModelo(req: Request, res: Response): Promise<Response> {
    try {
      const parse = createModeloSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({
          error: 'Dados inválidos.',
          code: 'VALIDATION_ERROR',
          details: parse.error.flatten().fieldErrors,
        });
      }

      const { marcaId, codigoProduto, nome, temporada, dataCorte, mfmReferenciaUrl, fichaTecnicaUrl, pecas } = parse.data;

      const modeloRepo = AppDataSource.getRepository(Modelo);
      const marcaRepo  = AppDataSource.getRepository(Marca);

      // Verifica existência da marca
      const marca = await marcaRepo.findOne({ where: { id: marcaId } });
      if (!marca) {
        return res.status(404).json({ error: 'Marca não encontrada.', code: 'MARCA_NOT_FOUND' });
      }

      // Verifica duplicidade de codigoProduto
      const existe = await modeloRepo.findOne({ where: { codigoProduto } });
      if (existe) {
        return res.status(409).json({
          error: 'Já existe um modelo com este código de produto.',
          code: 'MODELO_DUPLICATE_CODE',
        });
      }

      const modelo = modeloRepo.create({
        marcaId,
        codigoProduto,
        nome,
        temporada:        temporada        || null,
        dataCorte:        dataCorte        ? new Date(dataCorte) : null,
        mfmReferenciaUrl: mfmReferenciaUrl || null,
        fichaTecnicaUrl:  fichaTecnicaUrl  || null,
        ativo: true,
      });

      const saved = await modeloRepo.save(modelo);

      // Se houver lista de peças enviadas no payload unificado, salva na tabela `pecas`
      if (pecas && Array.isArray(pecas) && pecas.length > 0) {
        const pecaRepo = AppDataSource.getRepository(Peca);
        const novasPecas = pecas.map((p: any) => pecaRepo.create({
          modeloId: saved.id,
          nome: p.nome || `${p.numero} - ${p.nome}`,
          setorCorteOpcaoId: p.setorCorteOpcaoId || null,
          descricao: p.descricao || p.codigoOriginal || null
        }));
        await pecaRepo.save(novasPecas);
      }

      return res.status(201).json({
        message: 'Modelo criado com sucesso.',
        modelo: saved,
      });
    } catch (error: any) {
      console.error('[AdminController] Erro ao criar modelo:', error);
      return res.status(500).json({ error: 'Erro ao criar modelo.' });
    }
  }

  /**
   * Lista todas as marcas ativas (para dropdown do formulário de criação de modelos).
   */
  public async getMarcas(_req: Request, res: Response): Promise<Response> {
    try {
      const marcaRepo = AppDataSource.getRepository(Marca);
      const marcas = await marcaRepo.find({
        where: { ativo: true },
        order: { nome: 'ASC' },
      });
      return res.json(marcas);
    } catch (error) {
      console.error('[AdminController] Erro ao listar marcas:', error);
      return res.status(500).json({ error: 'Erro ao listar marcas' });
    }
  }

  /** Lista marcas ativas e inativas para a tela administrativa. */
  public async getTodasMarcas(_req: Request, res: Response): Promise<Response> {
    try {
      const marcas = await AppDataSource.getRepository(Marca).find({
        order: { nome: 'ASC' },
      });
      return res.json(marcas);
    } catch (error) {
      console.error('[AdminController] Erro ao listar marcas para administração:', error);
      return res.status(500).json({ error: 'Erro ao carregar marcas.' });
    }
  }

  /** Cria uma marca no schema da aplicação. */
  public async createMarca(req: Request, res: Response): Promise<Response> {
    const parsed = createMarcaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        code: 'MARCA_VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const nome = normalizarNomeMarca(parsed.data.nome);
      const marcaRepo = AppDataSource.getRepository(Marca);
      const existentes = await marcaRepo.find({ select: { id: true, nome: true } });
      if (existentes.some((marca) => nomesDeMarcaIguais(marca.nome, nome))) {
        return res.status(409).json({
          error: 'Já existe uma marca com esse nome.',
          code: 'MARCA_DUPLICATE_NAME',
        });
      }

      const marca = await marcaRepo.save(marcaRepo.create({ nome, ativo: true }));
      return res.status(201).json(marca);
    } catch (error) {
      console.error('[AdminController] Erro ao criar marca:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar marca.' });
    }
  }

  /** Renomeia ou ativa/desativa uma marca sem apagar referências históricas. */
  public async updateMarca(req: Request, res: Response): Promise<Response> {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Identificador de marca inválido.', code: 'MARCA_ID_INVALID' });
    }

    const parsed = updateMarcaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        code: 'MARCA_VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const marcaRepo = AppDataSource.getRepository(Marca);
      const marca = await marcaRepo.findOne({ where: { id: id.data } });
      if (!marca) {
        return res.status(404).json({ error: 'Marca não encontrada.', code: 'MARCA_NOT_FOUND' });
      }

      if (parsed.data.nome !== undefined) {
        const nome = normalizarNomeMarca(parsed.data.nome);
        const existentes = await marcaRepo.find({ select: { id: true, nome: true } });
        if (existentes.some((outra) => outra.id !== marca.id && nomesDeMarcaIguais(outra.nome, nome))) {
          return res.status(409).json({
            error: 'Já existe uma marca com esse nome.',
            code: 'MARCA_DUPLICATE_NAME',
          });
        }
        marca.nome = nome;
      }

      if (parsed.data.ativo !== undefined) {
        marca.ativo = parsed.data.ativo;
      }

      return res.json(await marcaRepo.save(marca));
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar marca:', error);
      return res.status(500).json({ error: 'Erro ao atualizar marca.' });
    }
  }

  /**
   * Lista todas as plantas industriais cadastradas no sistema.
   */
  public async getPlantas(_req: Request, res: Response): Promise<Response> {
    try {
      const plantaRepo = AppDataSource.getRepository(Planta);
      const plantas = await plantaRepo.find({
        where: { ativo: true },
        order: { nome: 'ASC' }
      });
      return res.json(plantas);
    } catch (error) {
      console.error('[AdminController] Erro ao listar plantas:', error);
      return res.status(500).json({ error: 'Erro ao listar plantas' });
    }
  }

  /**
   * Lista todos os usuários cadastrados no sistema (com perfil e planta).
   */
  public async getUsuarios(_req: Request, res: Response): Promise<Response> {
    try {
      const userRepo = AppDataSource.getRepository(Usuario);
      const users = await userRepo.find({
        relations: { perfil: true, setor: true, planta: true },
        order: { nomeCompleto: 'ASC' }
      });
      return res.json(users.map((user) => ({
        id: user.id,
        nomeCompleto: user.nomeCompleto,
        usuario: user.usuario,
        cargo: user.cargo,
        email: user.email,
        ativo: user.ativo,
        ultimoAcesso: user.ultimoAcesso,
        perfilId: user.perfilId,
        perfil: user.perfil ? {
          id: user.perfil.id,
          nome: user.perfil.nome,
          descricao: user.perfil.descricao,
        } : null,
        setorId: user.setorId,
        setor: user.setor ? { id: user.setor.id, nome: user.setor.nome } : null,
        plantaId: user.plantaId,
        planta: user.planta ? { id: user.planta.id, nome: user.planta.nome } : null,
      })));
    } catch (error) {
      console.error('[AdminController] Erro ao listar usuários:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  /**
   * Obtém a matriz de permissões para um determinado perfilId.
   */
  public async getPermissoes(req: Request, res: Response): Promise<Response> {
    try {
      const { perfilId } = req.params;
      const permissaoRepo = AppDataSource.getRepository(PerfilPermissao);
      const permissoes = await permissaoRepo.find({
        where: { perfilId: perfilId as string },
        relations: { setor: true }
      });
      return res.json(permissoes);
    } catch (error) {
      console.error('[AdminController] Erro ao buscar permissões:', error);
      return res.status(500).json({ error: 'Erro ao buscar permissões' });
    }
  }

  /** Catálogo de telas e ações exibidas na matriz RBAC. */
  public async getCatalogoPermissoes(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json(await carregarCatalogoRbac());
    } catch (error) {
      console.error('[AdminController] Erro ao carregar catálogo RBAC:', error);
      return res.status(500).json({ error: 'Erro ao carregar catálogo de permissões.' });
    }
  }

  public async getAuditoriaRbac(req: Request, res: Response): Promise<Response> {
    try {
      const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 100000));
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
      const [rows, total] = await AppDataSource.getRepository(AuditLog).createQueryBuilder('audit')
        .leftJoinAndSelect('audit.usuario', 'usuario')
        .where('left(audit.acao, 5) = :prefix', { prefix: 'RBAC_' })
        .orderBy('audit.createdAt', 'DESC').addOrderBy('audit.id', 'DESC')
        .skip(offset).take(limit).getManyAndCount();
      return res.json({ total, items: rows.map((row) => ({
        id: row.id, acao: row.acao, entidadeTipo: row.entidadeTipo, entidadeId: row.entidadeId,
        dadosAnteriores: row.dadosAnteriores, dadosNovos: row.dadosNovos, createdAt: row.createdAt,
        usuario: row.usuario ? { nomeCompleto: row.usuario.nomeCompleto, usuario: row.usuario.usuario } : null,
      })) });
    } catch (error) {
      console.error('[AdminController] Erro ao carregar auditoria RBAC:', error);
      return res.status(500).json({ error: 'Erro ao carregar auditoria de acessos.' });
    }
  }

  /**
   * Altera dinamicamente as permissões RBAC de um ou mais perfis (Upsert).
   */
  public async updatePermissoes(req: Request, res: Response): Promise<Response> {
    const rawItems = Array.isArray(req.body) ? req.body : [req.body];
    if (rawItems.length === 0 || rawItems.length > 500) {
      return res.status(400).json({ error: 'Envie entre 1 e 500 permissões por atualização.', code: 'RBAC_BATCH_SIZE_INVALID' });
    }

    let catalogo;
    try {
      catalogo = await carregarCatalogoRbac();
    } catch (error) {
      console.error('[AdminController] Erro ao carregar catálogo RBAC:', error);
      return res.status(500).json({ error: 'Erro ao validar catálogo de permissões.' });
    }
    const screenKeys = new Set(catalogo.screens.flatMap(({ viewPermission, editPermission }) => [viewPermission, editPermission].filter(Boolean) as string[]));
    const globalKeys = new Set(catalogo.globalActions.map(({ acao }) => acao));
    const sectorKeys = new Set(catalogo.sectorActions.map(({ acao }) => acao));
    const normalizedItems = new Map<string, { perfilId: string; setorId: string | null; acao: string; permitido: boolean }>();

    for (const item of rawItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'Cada permissão deve ser um objeto válido.', code: 'RBAC_PERMISSION_INVALID' });
      }

      const perfilId = z.string().uuid().safeParse(item.perfilId);
      const acao = typeof item.acao === 'string' ? item.acao.trim() : '';
      const permitido = item.permitido;
      const setorRaw = item.setorId;
      const setorId = setorRaw === null || setorRaw === undefined || setorRaw === '' || setorRaw === 'null' || setorRaw === 'undefined'
        ? null
        : z.string().uuid().safeParse(setorRaw);

      if (!perfilId.success || ![...screenKeys, ...globalKeys, ...sectorKeys].includes(acao) || typeof permitido !== 'boolean' || (setorId !== null && !setorId.success)) {
        return res.status(400).json({ error: 'Dados inválidos para a permissão.', code: 'RBAC_PERMISSION_INVALID' });
      }
      if ((screenKeys.has(acao) || globalKeys.has(acao)) && setorId !== null || sectorKeys.has(acao) && setorId === null) {
        return res.status(400).json({ error: 'Escopo de setor inválido para esta permissão.', code: 'RBAC_PERMISSION_SCOPE_INVALID' });
      }

      const normalized = {
        perfilId: perfilId.data,
        setorId: setorId === null ? null : setorId.data,
        acao,
        permitido,
      };
      normalizedItems.set(`${normalized.perfilId}|${normalized.setorId || ''}|${normalized.acao}`, normalized);
    }

    try {
      const savedItems = await AppDataSource.transaction(async (manager) => {
        const items = [...normalizedItems.values()];
        const byPermissionKey = new Map(items.map((item) => [
          `${item.perfilId}|${item.setorId || ''}|${item.acao}`,
          item,
        ]));

        for (const screen of catalogo.screens) {
          if (!screen.editPermission) continue;
          for (const item of items) {
            if (item.setorId !== null) continue;
            if (item.acao === screen.editPermission && item.permitido) {
              const viewKey = `${item.perfilId}||${screen.viewPermission}`;
              const explicitView = byPermissionKey.get(viewKey);
              if (explicitView?.permitido === false) {
                throw Object.assign(new Error('A permissão de edição exige acesso de visualização à mesma tela.'), {
                  statusCode: 400,
                  code: 'RBAC_EDIT_REQUIRES_VIEW',
                });
              }
              if (!explicitView) {
                const viewPermission = {
                  perfilId: item.perfilId,
                  setorId: null,
                  acao: screen.viewPermission,
                  permitido: true,
                };
                byPermissionKey.set(viewKey, viewPermission);
              }
            }

            if (item.acao === screen.viewPermission && !item.permitido) {
              const editKey = `${item.perfilId}||${screen.editPermission}`;
              const explicitEdit = byPermissionKey.get(editKey);
              if (explicitEdit?.permitido === true) {
                throw Object.assign(new Error('Não é possível remover a visualização enquanto a edição estiver habilitada.'), {
                  statusCode: 400,
                  code: 'RBAC_VIEW_REQUIRED_FOR_EDIT',
                });
              }
              byPermissionKey.set(editKey, {
                perfilId: item.perfilId,
                setorId: null,
                acao: screen.editPermission,
                permitido: false,
              });
            }
          }
        }

        const itemsToSave = [...byPermissionKey.values()];
        const profileIds = [...new Set(itemsToSave.map(({ perfilId }) => perfilId))];
        const profiles = await manager.getRepository(Perfil).findBy({ id: In(profileIds), ativo: true });
        if (profiles.length !== profileIds.length) {
          throw Object.assign(new Error('Um ou mais perfis não existem ou estão inativos.'), { statusCode: 404, code: 'PERFIL_NOT_FOUND' });
        }

        const sectorIds = [...new Set(itemsToSave.map(({ setorId }) => setorId).filter((id): id is string => !!id))];
        if (sectorIds.length > 0) {
          const sectors = await manager.getRepository(Setor).findBy({ id: In(sectorIds), ativo: true });
          if (sectors.length !== sectorIds.length) {
            throw Object.assign(new Error('Um ou mais setores não existem ou estão inativos.'), { statusCode: 404, code: 'SETOR_NOT_FOUND' });
          }
        }

        const permissionRepo = manager.getRepository(PerfilPermissao);
        const saved: PerfilPermissao[] = [];
        for (const item of itemsToSave) {
          let permission = await permissionRepo.findOne({
            where: {
              perfilId: item.perfilId,
              setorId: item.setorId === null ? IsNull() : item.setorId,
              acao: item.acao,
            },
          });
          const antes = permission ? { permitido: permission.permitido } : null;
          if (permission) {
            permission.permitido = item.permitido;
          } else {
            permission = permissionRepo.create(item);
          }
          if (antes?.permitido !== item.permitido) {
            const salvo = await permissionRepo.save(permission);
            await auditarRbac(manager, req, 'RBAC_PERMISSAO_ALTERADA', 'perfil_permissoes', salvo.id, antes, {
              perfilId: salvo.perfilId, setorId: salvo.setorId, acao: salvo.acao, permitido: salvo.permitido,
            });
            saved.push(salvo);
          } else {
            saved.push(permission);
          }
        }
        return saved;
      });

      return res.json(savedItems);
    } catch (error: any) {
      if (error?.statusCode === 404) {
        return res.status(404).json({ error: error.message, code: error.code });
      }
      if (error?.statusCode === 400) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      console.error('[AdminController.updatePermissoes] Erro crítico ao atualizar permissões:', error);
      return res.status(500).json({ error: 'Erro ao atualizar permissões no banco de dados.' });
    }
  }

  /**
   * Altera o perfil associado a um determinado usuário (colaborador).
   */
  public async updateUsuarioPerfil(req: Request, res: Response): Promise<Response> {
    try {
      const id = String(req.params.id);
      const { perfilId, setorId } = req.body;

      if (!perfilId) {
        return res.status(400).json({ error: 'perfilId é obrigatório.' });
      }

      const userRepo = AppDataSource.getRepository(Usuario);
      const perfilRepo = AppDataSource.getRepository(Perfil);

      const user = await userRepo.findOne({
        where: { id },
        relations: { perfil: true, setor: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const perfilIdValidado = z.string().uuid().safeParse(perfilId);
      if (!perfilIdValidado.success) {
        return res.status(400).json({ error: 'Identificador de perfil inválido.', code: 'PERFIL_ID_INVALID' });
      }

      const novoPerfil = await perfilRepo.findOne({ where: { id: perfilIdValidado.data, ativo: true } });
      if (!novoPerfil) {
        return res.status(404).json({ error: 'Perfil não encontrado ou inativo.', code: 'PERFIL_NOT_FOUND' });
      }

      const usuarioAdminAutomacao = ehUsuarioAdminAutomacao(user.usuario);
      if (
        (novoPerfil.nome === PERFIL_ADMIN_AUTOMACAO && !usuarioAdminAutomacao) ||
        (usuarioAdminAutomacao && novoPerfil.nome !== PERFIL_ADMIN_AUTOMACAO)
      ) {
        return res.status(403).json({
          error: 'O perfil ADMIN_AUTOMACAO só pode ser provisionado para as contas autorizadas.',
          code: 'RBAC_AUTOMACAO_ASSIGNMENT_RESTRICTED',
        });
      }

      const anteriores = { perfilId: user.perfilId, setorId: user.setorId };
      user.perfil = novoPerfil;
      user.perfilId = novoPerfil.id;

      if (setorId !== undefined) {
        if (setorId === null || setorId === '') {
          user.setor = null;
          user.setorId = null;
        } else {
          const setorIdValidado = z.string().uuid().safeParse(setorId);
          if (!setorIdValidado.success) {
            return res.status(400).json({ error: 'Identificador de setor inválido.', code: 'SETOR_ID_INVALID' });
          }
          const setorRepo = AppDataSource.getRepository(Setor);
          const setor = await setorRepo.findOne({ where: { id: setorIdValidado.data, ativo: true } });
          if (!setor) {
            return res.status(404).json({ error: 'Setor não encontrado ou inativo.', code: 'SETOR_NOT_FOUND' });
          }
          user.setor = setor;
          user.setorId = setor.id;
        }
      }
      
      const salvo = await AppDataSource.transaction(async (manager) => {
        const atualizado = await manager.getRepository(Usuario).save(user);
        const novos = { perfilId: atualizado.perfilId, setorId: atualizado.setorId };
        if (JSON.stringify(anteriores) !== JSON.stringify(novos)) {
          await auditarRbac(manager, req, 'RBAC_USUARIO_ATUALIZADO', 'usuarios', atualizado.id, anteriores, novos);
        }
        return atualizado;
      });

      return res.json({
        message: 'Perfil do usuário atualizado com sucesso.',
        usuario: {
          id: salvo.id,
          nomeCompleto: salvo.nomeCompleto,
          usuario: salvo.usuario,
          perfilId: salvo.perfilId,
          setorId: salvo.setorId,
        },
      });
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar perfil do usuário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil do usuário.' });
    }
  }
}
