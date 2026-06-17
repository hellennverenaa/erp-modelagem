import { Request, Response } from 'express';

export class AuthController {
  public async login(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockToken...',
        usuario: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          nomeCompleto: 'Usuário Teste',
          usuario: 'user.teste',
          cargo: 'Operador',
          email: 'user.teste@empresa.com',
          ativo: true,
          perfilId: '550e8400-e29b-41d4-a716-446655440000',
          setorId: '550e8400-e29b-41d4-a716-446655440000',
          plantaId: '550e8400-e29b-41d4-a716-446655440000',
          gestorId: null,
          ultimoAcesso: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro no login' });
    }
  }

  public async refresh(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newMockToken...'
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro no refresh token' });
    }
  }

  public async logout(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json({ message: 'Logout efetuado com sucesso' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro no logout' });
    }
  }
}
