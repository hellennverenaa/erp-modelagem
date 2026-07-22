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
import { IsNull } from 'typeorm';
import { ConfigOpcao } from '../entities/ConfigOpcao';

// ─── Schema de validação para criação de Modelo ─────────────────────────────
const createModeloSchema = z.object({
  marcaId:       z.string().uuid({ message: 'marcaId deve ser um UUID válido.' }),
  codigoProduto: z.string().min(1).max(50),
  nome:          z.string().min(1).max(150),
  temporada:     z.string().max(50).optional().nullable(),
  mfmReferenciaUrl: z.string().url().optional().nullable(),
  fichaTecnicaUrl:  z.string().url().optional().nullable(),
});

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
        .orderBy('m.nome', 'ASC')
        .getMany();
      return res.json(modelos);
    } catch (error) {
      console.error('[AdminController] Erro ao listar catálogo de modelos:', error);
      return res.status(500).json({ error: 'Erro ao listar catálogo de modelos' });
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

      const { marcaId, codigoProduto, nome, temporada, mfmReferenciaUrl, fichaTecnicaUrl } = parse.data;

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
        mfmReferenciaUrl: mfmReferenciaUrl || null,
        fichaTecnicaUrl:  fichaTecnicaUrl  || null,
        ativo: true,
      });

      const saved = await modeloRepo.save(modelo);

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
        relations: { perfil: true, planta: true },
        order: { nomeCompleto: 'ASC' }
      });
      return res.json(users);
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

  /**
   * Altera dinamicamente as permissões RBAC de um ou mais perfis (Upsert).
   */
  public async updatePermissoes(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body;
      const items = Array.isArray(body) ? body : [body];

      const permissaoRepo = AppDataSource.getRepository(PerfilPermissao);
      const savedItems: PerfilPermissao[] = [];

      for (const item of items) {
        const { perfilId, setorId, acao, permitido } = item;

        if (!perfilId || !acao) {
          return res.status(400).json({ error: 'perfilId e acao são obrigatórios em cada item.' });
        }

        // Normalização defensiva de setorId contra strings inválidas ou serialização incorreta
        const normalizedSetorId = (setorId === 'null' || setorId === 'undefined' || setorId === '' || !setorId)
          ? null
          : setorId;

        // Busca se o registro correspondente já existe
        let perm = await permissaoRepo.findOne({
          where: {
            perfilId,
            setorId: normalizedSetorId ? normalizedSetorId : IsNull(),
            acao
          }
        });

        if (perm) {
          perm.permitido = permitido !== undefined ? permitido : true;
          // Garante a passagem do null primitivo do JavaScript e não do IsNull() do TypeORM ao salvar
          perm.setorId = normalizedSetorId;
          perm = await permissaoRepo.save(perm);
        } else {
          perm = permissaoRepo.create({
            perfilId,
            setorId: normalizedSetorId,
            acao,
            permitido: permitido !== undefined ? permitido : true
          });
          perm = await permissaoRepo.save(perm);
        }

        savedItems.push(perm);
      }

      return res.json(savedItems);
    } catch (error) {
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

      const novoPerfil = await perfilRepo.findOne({ where: { id: perfilId } });
      if (!novoPerfil) {
        return res.status(404).json({ error: 'Perfil não encontrado.' });
      }

      user.perfil = novoPerfil;
      user.perfilId = novoPerfil.id;

      if (setorId) {
        const setorRepo = AppDataSource.getRepository(Setor);
        const setor = await setorRepo.findOne({ where: { id: setorId } });
        if (setor) {
          user.setor = setor;
          user.setorId = setor.id;
        }
      } else {
        user.setor = null;
        user.setorId = null;
      }
      
      const salvo = await userRepo.save(user);

      return res.json({
        message: 'Perfil do usuário atualizado com sucesso.',
        usuario: salvo
      });
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar perfil do usuário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil do usuário.' });
    }
  }
}
