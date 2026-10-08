import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { In } from 'typeorm';
import { Checklist, ChecklistStatus } from '../entities/Checklist';
import { ChecklistItem } from '../entities/ChecklistItem';
import { ChecklistTemplate } from '../entities/ChecklistTemplate';
import { ChecklistTemplateItem } from '../entities/ChecklistTemplateItem';
import { Setor } from '../entities/Setor';
import { Marca } from '../entities/Marca';
import { CatalogoItemChecklist } from '../entities/CatalogoItemChecklist';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Peca } from '../entities/Peca';
import { triggerChecklistEmail } from '../services/email.service';
import { perfilPossuiPermissao } from '../services/rbac.service';

// ═══ Schema de Validação Zod para a resposta do Checklist ═══
const responderChecklistSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'ordemTesteId deve ser um UUID válido.' }),
  templateId: z.string().uuid({ message: 'templateId deve ser um UUID válido.' }),
  setorId: z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  bloqueante: z.boolean().optional().default(false),
  observacoes: z.string().optional().nullable(),
  respostas: z.array(
    z.object({
      templateItemId: z.string().uuid({ message: 'templateItemId deve ser um UUID válido.' }).optional().nullable(),
      itemId: z.string().uuid({ message: 'itemId deve ser um UUID válido.' }).optional().nullable(), // suporte a mapeamento alternativo da interface
      catalogItemId: z.string().uuid({ message: 'catalogItemId deve ser um UUID válido.' }).optional().nullable(),
      pecaId: z.string().uuid({ message: 'pecaId deve ser um UUID válido.' }).optional().nullable(),
      itemAvulso: z.boolean().optional().default(false),
      descricaoAvulsa: z.string().max(255, { message: 'A descrição avulsa não pode passar de 255 caracteres.' }).optional().nullable(),
      valorResposta: z.string().optional().nullable(),
      valorInformado: z.string().optional().nullable(), // suporte a mapeamento alternativo da interface
      conforme: z.boolean().optional(),
      emConformidade: z.boolean().optional(), // suporte a mapeamento alternativo da interface
      observacao: z.string().optional().nullable(),
      observacoes: z.string().optional().nullable(), // suporte a mapeamento alternativo da interface
    })
  ).nonempty({ message: 'O checklist deve conter pelo menos uma resposta.' })
});

export class ChecklistsController {
  private async resolverTipoSetorLeitura(
    req: Request,
    setorIdSolicitado?: string,
    tipoSetorSolicitado?: string,
  ): Promise<{ permitida: boolean; setorTipoOpcaoId?: string }> {
    if (!req.user) return { permitida: false };

    const podeVerTodos = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODOS_SETORES') ||
      await perfilPossuiPermissao(req.user.perfilId, 'ADMINISTRAR_BIPAGEM');
    const setorIdEfetivo = setorIdSolicitado || (!podeVerTodos ? req.user.setorId || undefined : undefined);

    if (setorIdSolicitado && !podeVerTodos && setorIdSolicitado !== req.user.setorId) {
      return { permitida: false };
    }

    let tipoSetorEfetivo = tipoSetorSolicitado;
    if (setorIdEfetivo) {
      const setor = await AppDataSource.getRepository(Setor).findOne({
        where: { id: setorIdEfetivo, ativo: true },
        select: { id: true, tipoOpcaoId: true },
      });
      if (!setor || (tipoSetorSolicitado && tipoSetorSolicitado !== setor.tipoOpcaoId)) {
        return { permitida: false };
      }
      tipoSetorEfetivo = setor.tipoOpcaoId;
    } else if (!podeVerTodos) {
      return { permitida: false };
    }

    return { permitida: true, setorTipoOpcaoId: tipoSetorEfetivo };
  }

  /**
   * GET /api/checklists/templates
   * Retorna os templates de checklists ativos no sistema
   */
  public getTemplates = async (req: Request, res: Response): Promise<Response> => {
    try {
      const setorId = typeof req.query.setorId === 'string' ? req.query.setorId : undefined;
      const tipoSetor = typeof req.query.setorTipoOpcaoId === 'string' ? req.query.setorTipoOpcaoId : undefined;
      const acesso = await this.resolverTipoSetorLeitura(req, setorId, tipoSetor);
      if (!acesso.permitida) {
        return res.status(403).json({ error: 'Seu perfil não pode acessar checklists deste setor.', code: 'RBAC_SECTOR_FORBIDDEN' });
      }

      const templateRepo = AppDataSource.getRepository(ChecklistTemplate);
      const templates = await templateRepo.find({
        where: acesso.setorTipoOpcaoId ? { ativo: true, setorTipoOpcaoId: acesso.setorTipoOpcaoId } : { ativo: true },
        relations: { itens: true },
        order: { nome: 'ASC', itens: { ordem: 'ASC' } }
      });
      return res.json(templates);
    } catch (error) {
      console.error('[ChecklistsController] Erro ao buscar templates:', error);
      return res.status(500).json({ error: 'Erro ao buscar templates' });
    }
  };

  /**
   * POST /api/checklists/responder
   * Recebe as respostas do operador e salva a checklist e seus itens, inclusive itens avulsos.
   */
  public responderChecklist = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Usuário não autenticado.',
          code: 'AUTH_UNAUTHENTICATED'
        });
      }

      // Validação do corpo da requisição com Zod
      const parseResult = responderChecklistSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Dados de preenchimento inválidos.',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors
        });
      }

      const { ordemTesteId, templateId, setorId, bloqueante, observacoes, respostas } = parseResult.data;

      if (
        respostas.some((resposta) => resposta.itemAvulso) &&
        !(await perfilPossuiPermissao(req.user.perfilId, 'ADICIONAR_ITEM_AVULSO_CHECKLIST'))
      ) {
        return res.status(403).json({
          error: 'Seu perfil não pode adicionar itens avulsos ao checklist.',
          code: 'RBAC_PERMISSION_DENIED',
          details: { acao: 'ADICIONAR_ITEM_AVULSO_CHECKLIST' },
        });
      }

      // Trava de Idempotência: Se o checklist para esta OP e Setor já existir/estiver preenchido, bloqueia 409 Conflict
      const checklistRepo = AppDataSource.getRepository(Checklist);
      const checklistExistente = await checklistRepo.findOne({
        where: {
          ordemTesteId,
          setorId
        }
      });

      if (checklistExistente) {
        return res.status(409).json({
          error: 'Este checklist já foi preenchido e bloqueado para esta OP.',
          code: 'CHECKLIST_ALREADY_SUBMITTED'
        });
      }

      // Executa toda a lógica em transação ACID do TypeORM
      const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
        // 1. Resolução segura de Foreign Key do ChecklistTemplate para evitar violação de FK no PostgreSQL
        const templateRepo = transactionalEntityManager.getRepository(ChecklistTemplate);
        let existingTemplate = await templateRepo.findOne({ where: { id: templateId } });
        const setor = await transactionalEntityManager.getRepository(Setor).findOne({ where: { id: setorId } });
        const ordem = await transactionalEntityManager.getRepository(OrdemTeste).findOne({
          where: { id: ordemTesteId },
          select: { id: true, modeloId: true, plantaId: true },
        });

        if (!setor) {
          throw Object.assign(new Error('Setor não encontrado.'), { statusCode: 404, code: 'SETOR_NOT_FOUND' });
        }
        if (!ordem) {
          throw Object.assign(new Error('Ordem de teste não encontrada.'), { statusCode: 404, code: 'ORDEM_NOT_FOUND' });
        }
        if (ordem.plantaId !== req.user!.plantaId && !(await perfilPossuiPermissao(req.user!.perfilId, 'ACESSAR_TODAS_PLANTAS'))) {
          throw Object.assign(new Error('Seu perfil não pode registrar checklist em outra planta.'), { statusCode: 403, code: 'RBAC_PLANTA_FORBIDDEN' });
        }

        if (!existingTemplate) {
          if (setor?.tipoOpcaoId) {
            existingTemplate = await templateRepo.findOne({ where: { setorTipoOpcaoId: setor.tipoOpcaoId } });
          }

          if (!existingTemplate) {
            const marcaRepo = transactionalEntityManager.getRepository(Marca);
            const marca = await marcaRepo.findOne({ where: { ativo: true } });
            const novoTemplate = templateRepo.create({
              nome: setor ? `Checklist — ${setor.nome}` : 'Checklist Genérico',
              setorTipoOpcaoId: setor?.tipoOpcaoId || undefined,
              marcaId: marca?.id || undefined,
              versao: 1,
              ativo: true
            });
            existingTemplate = await templateRepo.save(novoTemplate);
          }
        }

        const validTemplateId = existingTemplate.id;
        const templateItemIds = [...new Set(respostas
          .map((resposta) => resposta.templateItemId || resposta.itemId)
          .filter((id): id is string => !!id))];
        const catalogItemIds = [...new Set(respostas
          .map((resposta) => resposta.catalogItemId)
          .filter((id): id is string => !!id))];
        const pecaIds = [...new Set(respostas
          .map((resposta) => resposta.pecaId)
          .filter((id): id is string => !!id))];

        const templateItems = templateItemIds.length
          ? await transactionalEntityManager.getRepository(ChecklistTemplateItem).find({
              where: { id: In(templateItemIds), templateId: validTemplateId },
              select: { id: true },
            })
          : [];
        const catalogItems = catalogItemIds.length && setor.tipoOpcaoId
          ? await transactionalEntityManager.getRepository(CatalogoItemChecklist).find({
              where: { id: In(catalogItemIds), setorTipoOpcaoId: setor.tipoOpcaoId, ativo: true },
              select: { id: true },
            })
          : [];
        const pecas = pecaIds.length
          ? await transactionalEntityManager.getRepository(Peca).find({
              where: { id: In(pecaIds), modeloId: ordem.modeloId },
              select: { id: true },
            })
          : [];
        const validTemplateItemIds = new Set(templateItems.map(({ id }) => id));
        const validCatalogItemIds = new Set(catalogItems.map(({ id }) => id));
        const validPecaIds = new Set(pecas.map(({ id }) => id));

        let hasPending = false;
        const itemsToSave: ChecklistItem[] = [];

        // Mapeia e prepara cada item de resposta
        for (const ans of respostas) {
          const templateItemId = ans.templateItemId || ans.itemId || null;
          const catalogItemId = ans.catalogItemId || null;
          const pecaId = ans.pecaId || null;
          const referenceCount = [templateItemId, catalogItemId, pecaId].filter(Boolean).length;
          const conforme = ans.conforme !== undefined 
            ? ans.conforme 
            : (ans.emConformidade !== undefined ? ans.emConformidade : true);

          if (ans.itemAvulso ? referenceCount > 0 : referenceCount !== 1) {
            throw Object.assign(new Error('Cada item deve ser cadastrado, vinculado a uma peça ou marcado como avulso.'), {
              statusCode: 400,
              code: 'CHECKLIST_ITEM_REFERENCE_INVALID',
            });
          }
          if (templateItemId && !validTemplateItemIds.has(templateItemId)) {
            throw Object.assign(new Error('Item de template inválido para este checklist.'), { statusCode: 400, code: 'CHECKLIST_TEMPLATE_ITEM_INVALID' });
          }
          if (catalogItemId && !validCatalogItemIds.has(catalogItemId)) {
            throw Object.assign(new Error('Item do catálogo inválido para este setor.'), { statusCode: 400, code: 'CHECKLIST_CATALOG_ITEM_INVALID' });
          }
          if (pecaId && !validPecaIds.has(pecaId)) {
            throw Object.assign(new Error('Peça inválida para a ordem de teste informada.'), { statusCode: 400, code: 'CHECKLIST_PECA_INVALID' });
          }

          if (!conforme) {
            hasPending = true;
          }

          const item = new ChecklistItem();
          item.templateItemId = templateItemId;
          item.descricaoAvulsa = ans.descricaoAvulsa || null;
          item.valorResposta = ans.valorResposta || ans.valorInformado || null;
          item.conforme = conforme;
          item.observacao = ans.observacao || ans.observacoes || null;

          // Validação da regra de negócio de itens avulsos
          if (ans.itemAvulso && !item.descricaoAvulsa) {
            throw new Error('Itens avulsos (sem templateItemId) devem possuir uma descrição avulsa preenchida.');
          }

          itemsToSave.push(item);
        }

        // Determina o status da checklist de acordo com as não-conformidades
        const status = hasPending ? ChecklistStatus.COM_PENDENCIAS : ChecklistStatus.PREENCHIDO;

        const checklist = new Checklist();
        checklist.ordemTesteId = ordemTesteId;
        checklist.templateId = validTemplateId;
        checklist.setorId = setorId;
        checklist.preenchidoPorId = req.user!.userId;
        checklist.dataPreenchimento = new Date();
        checklist.status = status;
        checklist.bloqueante = bloqueante;
        checklist.observacoes = observacoes || null;

        // Salva a Checklist cabeçalho
        const savedChecklist = await transactionalEntityManager.save(Checklist, checklist);

        // Salva todos os ChecklistItens associados
        for (const item of itemsToSave) {
          item.checklistId = savedChecklist.id;
          await transactionalEntityManager.save(ChecklistItem, item);
        }

        return savedChecklist;
      });

      // Dispara o e-mail em background sem travar a resposta HTTP
      triggerChecklistEmail(result.id, result.ordemTesteId);

      return res.status(201).json({
        message: 'Respostas do checklist salvas com sucesso.',
        checklist: result
      });

    } catch (error: any) {
      console.error('[ChecklistsController] Erro ao responder checklist:', error);
      const statusCode = error?.statusCode === 403 ? 403 : error?.statusCode === 404 ? 404 : 400;
      return res.status(statusCode).json({
        error: error.message || 'Erro ao salvar respostas do checklist.',
        code: error?.code || 'CHECKLIST_SAVE_FAILED'
      });
    }
  };

  /**
   * GET /api/checklists/:id
   * Retorna os dados e itens de um checklist preenchido pelo seu ID
   */
  public getChecklistById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const checklistRepo = AppDataSource.getRepository(Checklist);
      const checklist = await checklistRepo.findOne({
        where: { id },
        relations: { itens: true, template: true }
      });

      if (!checklist) {
        return res.status(404).json({
          error: 'Checklist não encontrado.',
          code: 'CHECKLIST_NOT_FOUND'
        });
      }

      if (
        checklist.setorId !== req.user?.setorId &&
        (!req.user || (
          !(await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODOS_SETORES')) &&
          !(await perfilPossuiPermissao(req.user.perfilId, 'ADMINISTRAR_BIPAGEM'))
        ))
      ) {
        return res.status(403).json({
          error: 'Seu perfil não pode visualizar checklists de outros setores.',
          code: 'RBAC_SECTOR_FORBIDDEN',
        });
      }

      return res.json(checklist);
    } catch (error) {
      console.error('[ChecklistsController] Erro ao buscar checklist por ID:', error);
      return res.status(500).json({ error: 'Erro ao buscar dados do checklist' });
    }
  };

  /**
   * GET /api/checklists/catalogo
   * Busca itens do catálogo de checklist (catalogo_itens_checklist) com filtro por setor e autocomplete por busca
   */
  public getCatalogo = async (req: Request, res: Response): Promise<Response> => {
    try {
      const setorId = typeof req.query.setorId === 'string' ? req.query.setorId : undefined;
      const setorTipoSolicitado = typeof req.query.setorTipoOpcaoId === 'string' ? req.query.setorTipoOpcaoId : undefined;
      const queryRaw = typeof req.query.q === 'string' ? req.query.q : req.query.query;
      const q = typeof queryRaw === 'string' ? queryRaw : undefined;
      const acesso = await this.resolverTipoSetorLeitura(req, setorId, setorTipoSolicitado);
      if (!acesso.permitida) {
        return res.status(403).json({ error: 'Seu perfil não pode acessar o catálogo deste setor.', code: 'RBAC_SECTOR_FORBIDDEN' });
      }

      const repo = AppDataSource.getRepository(CatalogoItemChecklist);
      const targetSetorTipoOpcaoId = acesso.setorTipoOpcaoId;

      const searchQuery = q?.trim() || '';

      const queryBuilder = repo.createQueryBuilder('item')
        .where('item.ativo = :ativo', { ativo: true });

      // Se há termo de busca 'q', busca globalmente (ou por número/descrição) no catálogo de engenharia
      if (searchQuery.length > 0) {
        queryBuilder.andWhere('(item.descricao ILIKE :q OR CAST(item.numeroItem AS TEXT) ILIKE :q)', { q: `%${searchQuery}%` });
        if (targetSetorTipoOpcaoId) {
          queryBuilder.andWhere('item.setorTipoOpcaoId = :setorTipoOpcaoId', { setorTipoOpcaoId: targetSetorTipoOpcaoId });
        }
      } else if (targetSetorTipoOpcaoId) {
        // Se não há termo de busca, filtra pelo setor específico
        queryBuilder.andWhere('item.setorTipoOpcaoId = :setorTipoOpcaoId', { setorTipoOpcaoId: targetSetorTipoOpcaoId });
      }

      queryBuilder.orderBy('item.numeroItem', 'ASC');

      let items = await queryBuilder.getMany();

      // Fallback: Se a busca por setor específico não retornou itens e não há busca por termo 'q',
      // retorna os 50 primeiros itens do catálogo geral para permitir seleção
      if (items.length === 0 && !searchQuery) {
        if (targetSetorTipoOpcaoId) {
          items = await repo.find({
            where: { ativo: true, setorTipoOpcaoId: targetSetorTipoOpcaoId },
            order: { numeroItem: 'ASC' },
            take: 50,
          });
        } else {
          items = await repo.find({ where: { ativo: true }, order: { numeroItem: 'ASC' }, take: 50 });
        }
      }

      return res.json(items);
    } catch (error) {
      console.error('[ChecklistsController] Erro ao buscar catálogo de itens:', error);
      return res.status(500).json({ error: 'Erro ao buscar catálogo de checklist' });
    }
  };
}
