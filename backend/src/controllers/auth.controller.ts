import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError } from '../services/auth.service';

export class AuthController {
  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Autentica o usuário com credenciais do ERP integrando ao SSO DASS Unix
   *     description: Realiza a autenticação via serviço legado e efetua o Upsert local do usuário no banco PostgreSQL.
   *     tags:
   *       - auth
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - usuario
   *               - senha
   *             properties:
   *               usuario:
   *                 type: string
   *                 example: "admin.erp"
   *               senha:
   *                 type: string
   *                 example: "SenhaSegura123!"
   *     responses:
   *       200:
   *         description: Login efetuado com sucesso
   *       401:
   *         description: Credenciais inválidas
   *       502:
   *         description: Erro de comunicação com o serviço legado
   */
  public login = async (req: Request, res: Response, _next?: NextFunction): Promise<Response | void> => {
    try {
      const { usuario, senha } = req.body;

      if (!usuario || !senha) {
        return res.status(400).json({
          error: 'Usuário e senha são obrigatórios.',
          code: 'AUTH_MISSING_CREDENTIALS'
        });
      }

      const result = await AuthService.processarLogin(usuario, senha);
      return res.json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }

      console.error('[AuthController.login] Erro inesperado no login:', error);
      return res.status(500).json({
        error: 'Erro interno durante o processo de autenticação.',
        code: 'AUTH_INTERNAL_ERROR'
      });
    }
  };

  public refresh = async (_req: Request, res: Response): Promise<Response> => {
    try {
      return res.json({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newMockToken...'
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro no refresh token' });
    }
  };

  public logout = async (_req: Request, res: Response): Promise<Response> => {
    try {
      return res.json({ message: 'Logout efetuado com sucesso' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro no logout' });
    }
  };

  /**
   * Valida credenciais de crachá/RFID de forma agnóstica a hardware (Chaves Duplas RFID e Barcode).
   * POST /api/auth/validar-cracha
   */
  public validarCracha = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { codigoCredencial } = req.body;

      if (!codigoCredencial || typeof codigoCredencial !== 'string') {
        return res.status(400).json({
          error: 'O campo codigoCredencial é obrigatório.',
          code: 'CREDENTIAL_REQUIRED'
        });
      }

      const result = await AuthService.validarCracha(codigoCredencial);
      return res.json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }

      console.error('[AuthController.validarCracha] Erro no banco de dados:', error);
      return res.status(500).json({
        error: error.message || 'Erro interno de banco de dados ao validar crachá.',
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  };
}
