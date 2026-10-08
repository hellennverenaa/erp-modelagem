import axios, { AxiosError } from 'axios';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { ehUsuarioAdminAutomacao, PERFIL_ADMIN_AUTOMACAO } from '../config/rbac.constants';
import { obterPermissoesGlobais } from './rbac.service';
import { Planta } from '../entities/Planta';

export interface SsoLoginResult {
  token: string;
  usuario: {
    id: string;
    nomeCompleto: string;
    usuario: string;
    cargo: string;
    email: string | null;
    rfid: string | null;
    codigoBarrasCracha: string | null;
    codigoCrachao: string | null;
    codigoCracha: string | null;
    ativo: boolean;
    perfilId: string;
    perfilNome: string | null;
    permissoes: Record<string, boolean>;
    setorId: string | null;
    plantaId: string;
    gestorId: string | null;
    ultimoAcesso: string | undefined;
    createdAt: string;
    updatedAt: string;
  };
}

export class AuthError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'AUTH_ERROR', details?: any) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class AuthService {
  /**
   * Obtém a URL do serviço de autenticação legado (Zero Hardcode).
   */
  private static getAuthServiceUrl(): string {
    const authServiceUrl = process.env.DASS_AUTH_URL;
    if (!authServiceUrl) {
      throw new AuthError(
        'A variável de ambiente DASS_AUTH_URL não está configurada.',
        500,
        'AUTH_SERVICE_URL_MISSING'
      );
    }
    return authServiceUrl;
  }

  /**
   * Realiza a chamada HTTP Axios para o serviço de autenticação legado dass_auth_service.
   * Aplica diretrizes de api-security-best-practices (não logar credenciais em texto claro)
   * e debug_issue (instrumentação detalhada inspecionando error.response.data e error.message).
   * 
   * Repassa as credenciais ao serviço legado e falha de forma explícita quando ele
   * estiver indisponível. Não emite sessões locais de fallback.
   */
  public static async autenticarLegado(usuario: string, senha: string): Promise<any> {
    const authServiceUrl = this.getAuthServiceUrl();

    try {
      const response = await axios.post(
        `${authServiceUrl}/auth/login`,
        { usuario, senha },
        { timeout: 5000 }
      );

      console.log('[AuthService] Autenticação concluída pelo serviço legado.');
      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const isTimeout = axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout');

      console.error('[AuthService] Falha na comunicação com o serviço legado.', {
        status: status || null,
        code: axiosError.code || null,
      });

      if (status === 401 || status === 403) {
        throw new AuthError(
          'Credenciais inválidas.',
          401,
          'AUTH_UNAUTHORIZED'
        );
      }

      if (isTimeout || !axiosError.response) {
        throw new AuthError(
          'Serviço de autenticação temporariamente indisponível.',
          503,
          'AUTH_SERVICE_UNAVAILABLE'
        );
      }

      throw new AuthError(
        'Erro de comunicação com o serviço de autenticação legado.',
        502,
        'AUTH_COMMUNICATION_ERROR'
      );
    }
  }

  /**
   * Busca o e-mail do usuário no serviço legado a partir da matrícula.
   */
  public static async buscarEmailLegado(matricula: string): Promise<string | null> {
    try {
      const authServiceUrl = this.getAuthServiceUrl();
      const emailResponse = await axios.get(`${authServiceUrl}/user/email/${matricula}`, {
        timeout: 5000
      });
      return emailResponse.data?.email || null;
    } catch (emailError: any) {
      console.warn('[AuthService] Não foi possível buscar o e-mail do usuário no legado:', emailError.message || emailError);
      return null;
    }
  }

  /**
   * Processa o login completo por meio do serviço legado Unix,
   * decodifica o JWT, normaliza chaves de crachá/RFID e efetua o Upsert no banco PostgreSQL.
   */
  public static async processarLogin(usuario: string, senha: string): Promise<SsoLoginResult> {
    if (!AppDataSource.isInitialized) {
      throw new AuthError(
        'Banco de dados indisponível. Aguarde a inicialização do backend e tente novamente.',
        503,
        'DATABASE_UNAVAILABLE'
      );
    }

    // 1. Autentica no serviço legado
    const legacyResponse = await this.autenticarLegado(usuario, senha);

    const usuarioRepository = AppDataSource.getRepository(Usuario);
    const perfilRepository = AppDataSource.getRepository(Perfil);
    const plantaRepository = AppDataSource.getRepository(Planta);

    // ═══ FLUXO COM RESPOSTA DO SERVIÇO LEGADO ═══
    // 2. Extração dinâmica do token suportando diferentes aninhamentos de payload
    const token =
      legacyResponse?.data?.token ||
      legacyResponse?.token ||
      legacyResponse?.data?.accessToken ||
      legacyResponse?.accessToken;

    if (!token) {
      throw new AuthError(
        'Token não retornado pelo serviço de autenticação.',
        401,
        'AUTH_TOKEN_MISSING'
      );
    }

    // 3. Validar a assinatura e decodificar as claims do token JWT Unix.
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || '', { clockTolerance: 120 });
    } catch {
      throw new AuthError(
        'O serviço de autenticação retornou um token inválido.',
        401,
        'AUTH_TOKEN_INVALID'
      );
    }
    const unixNome = decoded?.nome || legacyResponse?.data?.nome || 'Usuário ERP';
    // O SSO pode variar a capitalização do identificador. A identidade local
    // do ERP é canônica e case-insensitive para impedir usuários duplicados.
    const unixUsuario = String(
      decoded?.usuario || legacyResponse?.data?.usuario || usuario
    ).trim().toLowerCase();
    const unixFuncao = decoded?.funcao || 'Operador';

    // 4. Extração agnóstica das chaves duplas de crachá (RFID e Código de Barras)
    const rawRfid =
      decoded?.rfid ||
      decoded?.chip_rfid ||
      decoded?.rfid_chip ||
      legacyResponse?.data?.rfid ||
      legacyResponse?.rfid ||
      null;

    const rawBarcode =
      decoded?.codbarras ||
      decoded?.codigo_barras ||
      decoded?.codigoBarrasCracha ||
      decoded?.codigo_barras_cracha ||
      decoded?.codigoCracha ||
      decoded?.codigoCrachao ||
      decoded?.cracha ||
      decoded?.codigo_cracha ||
      decoded?.codigo_crachao ||
      legacyResponse?.data?.codbarras ||
      legacyResponse?.data?.codigo_barras ||
      legacyResponse?.data?.codigoBarrasCracha ||
      legacyResponse?.data?.codigo_barras_cracha ||
      legacyResponse?.data?.codigoCracha ||
      legacyResponse?.data?.codigoCrachao ||
      legacyResponse?.data?.cracha ||
      legacyResponse?.codbarras ||
      legacyResponse?.codigo_barras ||
      legacyResponse?.codigoBarrasCracha ||
      legacyResponse?.codigoCracha ||
      legacyResponse?.codigoCrachao ||
      legacyResponse?.cracha ||
      null;

    const unixRfid = rawRfid ? Usuario.normalizarCodigoCrachao(String(rawRfid)) || null : null;
    const unixBarcode = rawBarcode ? Usuario.normalizarCodigoCrachao(String(rawBarcode)) || null : null;

    // 5. Busca e-mail complementar no legado caso haja matrícula nas claims
    let unixEmail: string | null = null;
    if (decoded?.matricula) {
      unixEmail = await this.buscarEmailLegado(decoded.matricula);
    }

    // 6. Upsert no banco de dados local (PostgreSQL)
    let userLocal = await usuarioRepository
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.perfil', 'perfil')
      .where('LOWER(usuario.usuario) = :usuario', { usuario: unixUsuario })
      .orderBy('usuario.created_at', 'ASC')
      .getOne();

    if (userLocal && !userLocal.ativo) {
      throw new AuthError('Usuário inativo.', 403, 'AUTH_USER_INACTIVE');
    }

    if (userLocal) {
      if (ehUsuarioAdminAutomacao(unixUsuario)) {
        const perfilAdminAutomacao = await perfilRepository.findOne({
          where: { nome: PERFIL_ADMIN_AUTOMACAO, ativo: true },
        });
        if (perfilAdminAutomacao) {
          userLocal.perfil = perfilAdminAutomacao;
          userLocal.perfilId = perfilAdminAutomacao.id;
        }
      }

      userLocal.nomeCompleto = unixNome;
      if (unixEmail) userLocal.email = unixEmail;
      userLocal.cargo = unixFuncao;
      if (unixRfid) userLocal.rfid = unixRfid;
      if (unixBarcode) {
        userLocal.codigoBarrasCracha = unixBarcode;
        userLocal.codigoCrachao = unixBarcode;
        userLocal.codigoCracha = unixBarcode;
      }
      userLocal.ultimoAcesso = new Date();
      userLocal = await usuarioRepository.save(userLocal);

      userLocal =
        (await usuarioRepository.findOne({
          where: { id: userLocal.id },
          relations: { perfil: true }
        })) || userLocal;
    } else {
      const nomePerfilInicial = ehUsuarioAdminAutomacao(unixUsuario)
        ? PERFIL_ADMIN_AUTOMACAO
        : 'VISUALIZADOR';
      let perfil = await perfilRepository.findOne({ where: { nome: nomePerfilInicial, ativo: true } });
      if (!perfil) {
        throw new AuthError(
          nomePerfilInicial === PERFIL_ADMIN_AUTOMACAO
            ? 'Perfil da equipe de automação não foi provisionado.'
            : 'Perfil VISUALIZADOR não foi provisionado.',
          500,
          'AUTH_RBAC_PROFILE_MISSING',
        );
      }

      let planta = await plantaRepository.findOne({ where: { ativo: true } });
      if (!planta) {
        planta = plantaRepository.create({
          nome: 'Planta Padrão',
          endereco: 'Endereço Padrão',
          cidade: 'Cidade Padrão',
          estado: 'EX',
          ativo: true
        });
        planta = await plantaRepository.save(planta);
      }

      userLocal = usuarioRepository.create({
        usuario: unixUsuario,
        nomeCompleto: unixNome,
        email: unixEmail,
        cargo: unixFuncao,
        rfid: unixRfid,
        codigoBarrasCracha: unixBarcode,
        codigoCrachao: unixBarcode || unixRfid,
        codigoCracha: unixBarcode || unixRfid,
        senhaHash: 'EXTERNAL_AUTH_ONLY',
        perfil,
        planta,
        ativo: true,
        ultimoAcesso: new Date()
      });

      userLocal = await usuarioRepository.save(userLocal);
    }

    if (!userLocal.perfil || !userLocal.perfil.ativo) {
      throw new AuthError('O perfil de acesso deste usuário está inativo.', 403, 'AUTH_PROFILE_INACTIVE');
    }

    const permissoes = await obterPermissoesGlobais(userLocal.perfilId);

    return {
      token,
      usuario: {
        id: userLocal.id,
        nomeCompleto: userLocal.nomeCompleto,
        usuario: userLocal.usuario,
        cargo: userLocal.cargo,
        email: userLocal.email,
        rfid: userLocal.rfid,
        codigoBarrasCracha: userLocal.codigoBarrasCracha,
        codigoCrachao: userLocal.codigoCrachao,
        codigoCracha: userLocal.codigoCracha,
        ativo: userLocal.ativo,
        perfilId: userLocal.perfilId,
        perfilNome: userLocal.perfil?.nome || null,
        permissoes,
        setorId: userLocal.setorId,
        plantaId: userLocal.plantaId,
        gestorId: userLocal.gestorId,
        ultimoAcesso: userLocal.ultimoAcesso?.toISOString(),
        createdAt: userLocal.createdAt.toISOString(),
        updatedAt: userLocal.updatedAt.toISOString()
      }
    };
  }

  /**
   * Valida credenciais de crachá/RFID de forma agnóstica a hardware.
   */
  public static async validarCracha(codigoCredencial: string) {
    const codigoLimpo = Usuario.normalizarCodigoCrachao(codigoCredencial);
    if (!codigoLimpo) {
      throw new AuthError('Código de credencial inválido ou vazio.', 400, 'INVALID_CREDENTIAL_FORMAT');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(codigoLimpo);
    const usuarioRepo = AppDataSource.getRepository(Usuario);

    const query = usuarioRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.perfil', 'perfil')
      .leftJoinAndSelect('u.setor', 'setor')
      .where('u.ativo = true');

    if (isUuid) {
      query.andWhere('u.id = :uuid', { uuid: codigoLimpo });
    } else {
      query.andWhere(
        '(UPPER(u.rfid) = :code OR UPPER(u.codigo_barras_cracha) = :code OR UPPER(u.codigo_crachao) = :code OR UPPER(u.codigo_cracha) = :code OR UPPER(u.usuario) = :code OR UPPER(u.email) = :code)',
        { code: codigoLimpo }
      );
    }

    const user = await query.getOne();

    if (!user) {
      throw new AuthError('Credencial de gestor/coordenador inválida ou crachá não cadastrado.', 404, 'CREDENCIAL_INVALIDA');
    }

    if (!user.ativo) {
      throw new AuthError('Usuário associado a este crachá está inativo.', 403, 'USUARIO_INATIVO');
    }

    return {
      message: 'Credencial de gestor/coordenador validada com sucesso.',
      usuario: {
        id: user.id,
        nomeCompleto: user.nomeCompleto,
        cargo: user.cargo,
        perfilId: user.perfilId,
        perfilNome: user.perfil?.nome || null,
        setorId: user.setorId
      }
    };
  }
}
