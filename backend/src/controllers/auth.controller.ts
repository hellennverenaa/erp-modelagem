import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError } from '../services/auth.service';
import { obterPermissoesGlobais, usuarioPodeInterromperSla } from '../services/rbac.service';

export class AuthController {
  private forwardSessionCookies(res: Response, cookies?: string[]): void {
    if (cookies?.length) res.setHeader('Set-Cookie', cookies);
  }

  private clearSessionCookies(res: Response, forwardedCookies: string[] = []): void {
    const forwardedNames = new Set(
      forwardedCookies.map((cookie) => cookie.slice(0, cookie.indexOf('=')).trim()),
    );
    if (!forwardedNames.has('token')) res.clearCookie('token', { path: '/' });
    if (!forwardedNames.has('refreshToken')) res.clearCookie('refreshToken', { path: '/' });
  }

  public me = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado.', code: 'RBAC_UNAUTHENTICATED' });
    }

    try {
      return res.json({
        id: req.user.userId,
        nomeCompleto: req.user.nomeCompleto,
        usuario: req.user.usuario,
        perfilId: req.user.perfilId,
        perfilNome: req.user.perfilNome,
        permissoes: await obterPermissoesGlobais(req.user.perfilId),
        podeInterromperSla: await usuarioPodeInterromperSla(
          req.user.userId,
          req.user.usuario || '',
          req.user.perfilNome,
        ),
        setorId: req.user.setorId || null,
        plantaId: req.user.plantaId,
      });
    } catch (error) {
      console.error('[AuthController.me] Erro ao carregar permissões do usuário:', error);
      return res.status(500).json({ error: 'Erro ao carregar permissões do usuário.', code: 'AUTH_SESSION_LOAD_FAILED' });
    }
  };

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
      const { setCookies, ...response } = result;
      this.forwardSessionCookies(res, setCookies);
      return res.json(response);
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

  public refresh = async (req: Request, res: Response): Promise<Response> => {
    try {
      const session = await AuthService.renovarSessaoLegada(req.headers.cookie);
      this.forwardSessionCookies(res, session.setCookies);
      return res.json({ token: session.token });
    } catch (error: any) {
      if (error instanceof AuthError) {
        this.forwardSessionCookies(res, error.details?.setCookies);
        if (error.statusCode === 401) this.clearSessionCookies(res, error.details?.setCookies);
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }

      console.error('[AuthController.refresh] Erro inesperado ao renovar a sessão.');
      return res.status(500).json({
        error: 'Erro interno durante a renovação da sessão.',
        code: 'AUTH_REFRESH_INTERNAL_ERROR'
      });
    }
  };

  public logout = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await AuthService.encerrarSessaoLegada(req.headers.cookie);
      this.forwardSessionCookies(res, result.setCookies);
      this.clearSessionCookies(res, result.setCookies);
      if (result.status >= 500) {
        return res.status(502).json({
          error: 'Não foi possível revogar a sessão no serviço de autenticação.',
          code: 'AUTH_LOGOUT_FAILED'
        });
      }
      return res.json({ message: 'Logout efetuado com sucesso' });
    } catch (error: any) {
      if (error instanceof AuthError) {
        this.forwardSessionCookies(res, error.details?.setCookies);
        this.clearSessionCookies(res, error.details?.setCookies);
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }

      this.clearSessionCookies(res);
      console.error('[AuthController.logout] Erro inesperado ao encerrar a sessão.');
      return res.status(500).json({ error: 'Erro no logout', code: 'AUTH_LOGOUT_INTERNAL_ERROR' });
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
