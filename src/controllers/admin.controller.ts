import { Request, Response } from 'express';

export class AdminController {
  public async getUsuarios(_req: Request, res: Response): Promise<Response> {
    try {
      // Mock para documentação
      return res.json([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          nomeCompleto: 'Admin ERP',
          usuario: 'admin.erp',
          cargo: 'Administrador do Sistema',
          email: 'admin.erp@empresa.com',
          ativo: true,
          perfilId: '550e8400-e29b-41d4-a716-446655440000',
          setorId: null,
          plantaId: '550e8400-e29b-41d4-a716-446655440000',
          gestorId: null,
          ultimoAcesso: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }
}
