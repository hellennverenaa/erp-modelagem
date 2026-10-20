import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { Setor } from '../entities/Setor';
import { Modelo } from '../entities/Modelo';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Planta } from '../entities/Planta';
import { Marca } from '../entities/Marca';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { ehUsuarioAdminAutomacao, PERFIL_ADMIN_AUTOMACAO } from '../config/rbac.constants';
import { carregarCatalogoRbac } from '../services/rbac-catalog.service';
import { AuditLog } from '../entities/AuditLog';
import { modeloIdentificacaoSchema } from '../schemas/modelo.schema';
import { ModelPiecesError, ModelPieceInput, saveModelPieces } from '../services/model-pieces.service';
import { lockModelConfiguration } from '../services/route-integrity.service';
import { AdminRbacService, AdminRbacError } from '../services/admin-rbac.service';
import { MarcaService, MarcaServiceError } from '../services/marca.service';
import { parseDateOnly } from '../utils/date.utils';

function isAutomationActor(req: Request): boolean {
  const user = req.user;
  return !!user &&
    user.perfilNome?.trim().toUpperCase() === PERFIL_ADMIN_AUTOMACAO &&
    ehUsuarioAdminAutomacao(user.usuario || '');
}

// ─── Schema de validação para criação de Modelo ─────────────────────────────
const createModeloSchema = z.object({
  ...modeloIdentificacaoSchema.shape,
  dataCorte:     z.string().optional().nullable(),
  mfmReferenciaUrl: z.string().url().optional().nullable(),
  fichaTecnicaUrl:  z.string().url().optional().nullable(),
  pecas: z.array(
    z.object({
      catalogoPecaId: z.string().uuid(),
      setorCorteOpcaoId: z.string().uuid(),
    })
  ).min(2),
});

const createMarcaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome da marca é obrigatório.').max(100, 'O nome da marca deve ter no máximo 100 caracteres.'),
});

const createModeloRascunhoSchema = z.object({
  ...modeloIdentificacaoSchema.shape,
  dataCorte: z.string().nullable().optional().refine(
    (value) => value == null || Number.isFinite(new Date(value).getTime()),
    'Informe uma previsão de corte válida.',
  ),
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

export class AdminController {
  /** Cria somente a identificação do modelo para o PCP continuar com a ordem. */
  public async createModeloRascunho(req: Request, res: Response): Promise<Response> {
    const parsed = createModeloRascunhoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos para criar o modelo.',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const modelo = await AppDataSource.transaction(async (manager) => {
        const marca = await manager.getRepository(Marca).findOne({ where: { id: parsed.data.marcaId, ativo: true } });
        if (!marca) throw Object.assign(new Error('Marca não encontrada ou inativa.'), { code: 'MARCA_NOT_FOUND', status: 404 });
        const existe = await manager.getRepository(Modelo).findOne({ where: { codigoProduto: parsed.data.codigoProduto }, select: { id: true } });
        if (existe) throw Object.assign(new Error('Já existe um modelo com este código de produto.'), { code: 'MODELO_DUPLICATE_CODE', status: 409 });

        return manager.getRepository(Modelo).save(manager.getRepository(Modelo).create({
          marcaId: parsed.data.marcaId,
          codigoProduto: parsed.data.codigoProduto,
          nome: parsed.data.nome,
          dataCorte: parseDateOnly(parsed.data.dataCorte),
          temporada: null,
          mfmReferenciaUrl: null,
          fichaTecnicaUrl: null,
          ativo: true,
        }));
      });
      return res.status(201).json({ message: 'Modelo cadastrado. A ordem pode ser criada pelo PCP.', modelo });
    } catch (error: any) {
      if (error?.code === 'MODELO_DUPLICATE_CODE' || error?.code === 'MARCA_NOT_FOUND') {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Já existe um modelo com este código de produto.', code: 'MODELO_DUPLICATE_CODE' });
      }
      console.error('[AdminController] Erro ao criar modelo para o PCP:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar modelo.', code: 'MODELO_CREATE_FAILED' });
    }
  }

  /** Ajusta a previsão de corte do PCP antes de criar a ordem vinculada. */
  public async updatePrevisaoCorteModelo(req: Request, res: Response): Promise<Response> {
    const id = z.string().uuid().safeParse(req.params.id);
    const data = z.string().refine((value) => Number.isFinite(new Date(value).getTime()), 'Informe uma previsão de corte válida.').safeParse(req.body.dataCorte);
    if (!id.success || !data.success) {
      return res.status(400).json({ error: 'Informe uma previsão de corte válida.', code: 'VALIDATION_ERROR' });
    }
    try {
      const modelo = await AppDataSource.transaction(async (manager) => {
        await lockModelConfiguration(manager, id.data);
        const repo = manager.getRepository(Modelo);
        const atual = await repo.findOne({ where: { id: id.data, ativo: true } });
        if (!atual) throw Object.assign(new Error('Modelo não encontrado ou inativo.'), { status: 404, code: 'MODELO_NOT_FOUND' });
        const ordem = await manager.getRepository(OrdemTeste).findOne({ where: { modeloId: atual.id }, select: { id: true } });
        if (ordem) throw Object.assign(new Error('A previsão de corte não pode ser alterada depois da criação da ordem.'), { status: 409, code: 'MODEL_ALREADY_ORDERED' });
        atual.dataCorte = parseDateOnly(data.data);
        return repo.save(atual);
      });
      return res.json({ message: 'Previsão de corte atualizada.', modelo });
    } catch (error: any) {
      if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[AdminController] Erro ao atualizar previsão de corte:', error);
      return res.status(500).json({ error: 'Erro ao atualizar a previsão de corte.', code: 'DATA_CORTE_UPDATE_FAILED' });
    }
  }

  /**
   * Lista todos os perfis cadastrados no sistema.
   */
  public async getPerfis(req: Request, res: Response): Promise<Response> {
    try {
      const perfis = await AdminRbacService.listarPerfis(isAutomationActor(req));
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
      const salvo = await AdminRbacService.criarPerfil(
        parsed.data,
        { usuarioId: req.user?.userId, ipAddress: req.ip || null, isAutomationActor: isAutomationActor(req) }
      );
      return res.status(201).json(salvo);
    } catch (error: any) {
      if (error instanceof AdminRbacError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
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
      const salvo = await AdminRbacService.atualizarPerfil(
        id.data,
        parsed.data,
        { usuarioId: req.user?.userId, ipAddress: req.ip || null, isAutomationActor: isAutomationActor(req) }
      );
      return res.json(salvo);
    } catch (error: any) {
      if (error instanceof AdminRbacError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
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
        relations: { marca: true, pecas: { setorCorteOpcao: true, catalogoPeca: true }, rotas: { setor: true, planta: true } },
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

      const { marcaId, codigoProduto, nome, dataCorte, mfmReferenciaUrl, fichaTecnicaUrl, pecas } = parse.data;

      const saved = await AppDataSource.transaction(async (manager) => {
        const marca = await manager.getRepository(Marca).findOne({ where: { id: marcaId, ativo: true } });
        if (!marca) throw Object.assign(new Error('Marca não encontrada ou inativa.'), { code: 'MARCA_NOT_FOUND', status: 404 });

        const existe = await manager.getRepository(Modelo).findOne({ where: { codigoProduto } });
        if (existe) throw Object.assign(new Error('Já existe um modelo com este código de produto.'), { code: 'MODELO_DUPLICATE_CODE', status: 409 });

        const modeloRepo = manager.getRepository(Modelo);
        const modelo = await modeloRepo.save(modeloRepo.create({
          marcaId,
          codigoProduto,
          nome,
          temporada: null,
          dataCorte: parseDateOnly(dataCorte),
          mfmReferenciaUrl: mfmReferenciaUrl || null,
          fichaTecnicaUrl: fichaTecnicaUrl || null,
          ativo: true,
        }));
        await saveModelPieces(manager, modelo.id, pecas as ModelPieceInput[]);
        return modelo;
      });

      return res.status(201).json({ message: 'Modelo criado com sucesso.', modelo: saved });
    } catch (error: any) {
      if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
      if (error?.code === 'MODELO_DUPLICATE_CODE' || error?.code === 'MARCA_NOT_FOUND') {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[AdminController] Erro ao criar modelo:', error);
      return res.status(500).json({ error: 'Erro ao criar modelo.' });
    }
  }

  /** Atualiza vínculos de catálogo e sub-setores sem apagar IDs de peças históricos. */
  public async atualizarPecasModelo(req: Request, res: Response): Promise<Response> {
    const modeloId = z.string().uuid().safeParse(req.params.id);
    const parsed = z.object({ pecas: z.array(z.object({
      id: z.string().uuid().optional(),
      catalogoPecaId: z.string().uuid(),
      setorCorteOpcaoId: z.string().uuid(),
    })).min(2) }).safeParse(req.body);
    if (!modeloId.success || !parsed.success) {
      return res.status(400).json({ error: 'Informe peças e sub-setores válidos para o modelo.', code: 'VALIDATION_ERROR' });
    }
    try {
      const pecas = await AppDataSource.transaction(async (manager) => {
        await lockModelConfiguration(manager, modeloId.data);
        const modelo = await manager.getRepository(Modelo).findOne({ where: { id: modeloId.data }, select: { id: true } });
        if (!modelo) throw Object.assign(new Error('Modelo não encontrado.'), { code: 'MODELO_NOT_FOUND', status: 404 });
        const ordem = await manager.getRepository(OrdemTeste).findOne({ where: { modeloId: modelo.id }, select: { id: true } });
        if (ordem) throw Object.assign(new Error('As peças deste modelo devem ser alteradas pela configuração da ordem na fila da Modelagem.'), { code: 'MODEL_PIECES_MANAGED_BY_ORDER', status: 409 });
        return saveModelPieces(manager, modelo.id, parsed.data.pecas);
      });
      return res.json({ message: 'Peças do modelo atualizadas com sucesso.', pecas });
    } catch (error: any) {
      if (error instanceof ModelPiecesError) return res.status(400).json({ error: error.message, code: error.code });
      if (error?.code === 'MODELO_NOT_FOUND') return res.status(404).json({ error: error.message, code: error.code });
      if (error?.code === 'MODEL_PIECES_MANAGED_BY_ORDER') return res.status(409).json({ error: error.message, code: error.code });
      console.error('[AdminController] Erro ao atualizar peças do modelo:', error);
      return res.status(500).json({ error: 'Erro ao atualizar as peças do modelo.' });
    }
  }

  /**
   * Lista todas as marcas ativas (para dropdown do formulário de criação de modelos).
   */
  public async getMarcas(_req: Request, res: Response): Promise<Response> {
    try {
      const marcas = await MarcaService.listarMarcas(true);
      return res.json(marcas);
    } catch (error) {
      console.error('[AdminController] Erro ao listar marcas:', error);
      return res.status(500).json({ error: 'Erro ao listar marcas' });
    }
  }

  /** Lista marcas ativas e inativas para a tela administrativa. */
  public async getTodasMarcas(_req: Request, res: Response): Promise<Response> {
    try {
      const marcas = await MarcaService.listarMarcas(false);
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
      const marca = await MarcaService.criarMarca(parsed.data.nome);
      return res.status(201).json(marca);
    } catch (error: any) {
      if (error instanceof MarcaServiceError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
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
      const marca = await MarcaService.atualizarMarca(id.data, parsed.data);
      return res.json(marca);
    } catch (error: any) {
      if (error instanceof MarcaServiceError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
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
  public async getUsuarios(req: Request, res: Response): Promise<Response> {
    try {
      const userRepo = AppDataSource.getRepository(Usuario);
      const users = await userRepo.find({
        relations: { perfil: true, setor: true, planta: true },
        order: { nomeCompleto: 'ASC' }
      });
      const visibleUsers = isAutomationActor(req)
        ? users
        : users.filter((user) =>
          user.perfil?.nome !== PERFIL_ADMIN_AUTOMACAO && !ehUsuarioAdminAutomacao(user.usuario),
        );
      return res.json(visibleUsers.map((user) => ({
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
        podeInterromperSla: user.podeInterromperSla || (
          user.perfil?.nome === PERFIL_ADMIN_AUTOMACAO && ehUsuarioAdminAutomacao(user.usuario)
        ),
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
      const parsedPerfilId = z.string().uuid().safeParse(req.params.perfilId);
      if (!parsedPerfilId.success) {
        return res.status(400).json({ error: 'Identificador de perfil inválido.', code: 'PERFIL_ID_INVALID' });
      }
      const perfilId = parsedPerfilId.data;
      const profile = await AppDataSource.getRepository(Perfil).findOne({ where: { id: perfilId } });
      if (!profile) {
        return res.status(404).json({ error: 'Perfil não encontrado.', code: 'PERFIL_NOT_FOUND' });
      }
      if (!isAutomationActor(req) && profile.nome === PERFIL_ADMIN_AUTOMACAO) {
        return res.status(403).json({
          error: 'A matriz do perfil ADMIN_AUTOMACAO é restrita à equipe de automação.',
          code: 'RBAC_AUTOMACAO_PROFILE_PROTECTED',
        });
      }
      const permissaoRepo = AppDataSource.getRepository(PerfilPermissao);
      const permissoes = await permissaoRepo.find({
        where: { perfilId },
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

    const automationActor = isAutomationActor(req);
    if (!automationActor && [...normalizedItems.values()].some((item) => item.acao === 'TELA_GESTAO_RBAC')) {
      return res.status(403).json({
        error: 'Somente a equipe de automação pode conceder ou revogar acesso à Matriz de Acessos.',
        code: 'RBAC_MATRIX_ACCESS_AUTOMATION_ONLY',
      });
    }

    try {
      const savedItems = await AdminRbacService.atualizarPermissoes(
        [...normalizedItems.values()],
        { usuarioId: req.user?.userId, ipAddress: req.ip || null, isAutomationActor: automationActor }
      );
      return res.json(savedItems);
    } catch (error: any) {
      if (error instanceof AdminRbacError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
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

      const perfilIdValidado = z.string().uuid().safeParse(perfilId);
      if (!perfilIdValidado.success) {
        return res.status(400).json({ error: 'Identificador de perfil inválido.', code: 'PERFIL_ID_INVALID' });
      }

      let setorIdFinal: string | null | undefined = undefined;
      if (setorId !== undefined) {
        if (setorId === null || setorId === '') {
          setorIdFinal = null;
        } else {
          const setorIdValidado = z.string().uuid().safeParse(setorId);
          if (!setorIdValidado.success) {
            return res.status(400).json({ error: 'Identificador de setor inválido.', code: 'SETOR_ID_INVALID' });
          }
          setorIdFinal = setorIdValidado.data;
        }
      }

      const atualizado = await AdminRbacService.atualizarPerfilUsuario(
        id,
        perfilIdValidado.data,
        setorIdFinal,
        { usuarioId: req.user?.userId, ipAddress: req.ip || null, isAutomationActor: isAutomationActor(req) }
      );

      return res.json({
        message: 'Perfil do usuário atualizado com sucesso.',
        usuario: {
          id: atualizado.id,
          nomeCompleto: atualizado.nomeCompleto,
          usuario: atualizado.usuario,
          perfilId: atualizado.perfilId,
          setorId: atualizado.setorId,
        },
      });
    } catch (error: any) {
      if (error instanceof AdminRbacError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[AdminController] Erro ao atualizar perfil do usuário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil do usuário.' });
    }
  }

  /** Concede ou revoga a permissão individual de interromper o SLA. */
  public async updateUsuarioPermissaoPausaSla(req: Request, res: Response): Promise<Response> {
    const id = z.string().uuid().safeParse(req.params.id);
    const payload = z.object({ permitido: z.boolean() }).safeParse(req.body);
    if (!id.success) {
      return res.status(400).json({ error: 'Identificador de usuário inválido.', code: 'USUARIO_ID_INVALID' });
    }
    if (!payload.success) {
      return res.status(400).json({ error: 'Informe se a pausa do SLA deve ser permitida.', code: 'RBAC_PERMISSION_INVALID' });
    }

    try {
      const resultado = await AdminRbacService.atualizarPermissaoPausaSla(
        id.data,
        payload.data.permitido,
        { usuarioId: req.user?.userId, ipAddress: req.ip || null, isAutomationActor: isAutomationActor(req) }
      );
      return res.json(resultado);
    } catch (error: any) {
      if (error instanceof AdminRbacError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[AdminController] Erro ao atualizar permissão individual de pausa do SLA:', error);
      return res.status(500).json({ error: 'Erro ao atualizar permissão para interromper o SLA.' });
    }
  }
}
