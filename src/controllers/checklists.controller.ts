import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Checklist, ChecklistStatus } from '../entities/Checklist';
import { ChecklistItem } from '../entities/ChecklistItem';
import { ChecklistTemplate } from '../entities/ChecklistTemplate';
import { triggerChecklistEmail } from '../services/genkitFlows.service';

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
  /**
   * GET /api/checklists/templates
   * Retorna os templates de checklists ativos no sistema
   */
  public getTemplates = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const templateRepo = AppDataSource.getRepository(ChecklistTemplate);
      const templates = await templateRepo.find({
        where: { ativo: true },
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

      // Executa toda a lógica em transação ACID do TypeORM
      const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
        let hasPending = false;
        const itemsToSave: ChecklistItem[] = [];

        // Mapeia e prepara cada item de resposta
        for (const ans of respostas) {
          const templateItemId = ans.templateItemId || ans.itemId || null;
          const conforme = ans.conforme !== undefined 
            ? ans.conforme 
            : (ans.emConformidade !== undefined ? ans.emConformidade : true);

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
          if (!templateItemId && !item.descricaoAvulsa) {
            throw new Error('Itens avulsos (sem templateItemId) devem possuir uma descrição avulsa preenchida.');
          }

          itemsToSave.push(item);
        }

        // Determina o status da checklist de acordo com as não-conformidades
        const status = hasPending ? ChecklistStatus.COM_PENDENCIAS : ChecklistStatus.PREENCHIDO;

        const checklist = new Checklist();
        checklist.ordemTesteId = ordemTesteId;
        checklist.templateId = templateId;
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
      return res.status(400).json({
        error: error.message || 'Erro ao salvar respostas do checklist.',
        code: 'CHECKLIST_SAVE_FAILED'
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

      return res.json(checklist);
    } catch (error) {
      console.error('[ChecklistsController] Erro ao buscar checklist por ID:', error);
      return res.status(500).json({ error: 'Erro ao buscar dados do checklist' });
    }
  };
}
