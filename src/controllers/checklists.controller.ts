import { Request, Response } from 'express';

export class ChecklistsController {
  public async getTemplates(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          nome: 'Checklist Padrão de Montagem',
          versao: 1,
          ativo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar templates' });
    }
  }

  public async responderChecklist(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
        usuarioResponsavelId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'CONCLUIDO',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar respostas do checklist' });
    }
  }

  public async getChecklistById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      return res.json({
        id,
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
        usuarioResponsavelId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'CONCLUIDO',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar dados do checklist' });
    }
  }
}
