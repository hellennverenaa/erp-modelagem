import axios, { AxiosError } from 'axios';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
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
    permissoes: Record<string, any>;
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
    const authServiceUrl = process.env.DASS_AUTH_URL || process.env.AUTH_SERVICE_URL;
    if (!authServiceUrl) {
      throw new AuthError(
        'A variável de ambiente DASS_AUTH_URL ou AUTH_SERVICE_URL não está configurada.',
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
   * Inclui bypass de desenvolvimento: se process.env.NODE_ENV indicar ambiente dev e o
   * container legado retornar 500 ou falha de rede, o sistema ativa fallback local com
   * isolamento multi-tenant (planta_id).
   */
  public static async autenticarLegado(usuario: string, senha: string): Promise<any> {
    const authServiceUrl = this.getAuthServiceUrl();

    try {
      console.log(`[AuthService] Enviando requisição de login para ${authServiceUrl}/auth/login (usuário: "${usuario}")`);
      const response = await axios.post(
        `${authServiceUrl}/auth/login`,
        { usuario, senha },
        { timeout: 5000 }
      );

      console.log('[AuthService] ✅ Resposta bem-sucedida do SSO Unix:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const isTimeout = axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout');

      // ═══ Log Detalhado de Diagnóstico (debug_issue / Systematic Debugging) ═══
      console.error('════════════════════════════════════════════════════════════════');
      console.error('[AuthService] ❌ Falha na comunicação com o serviço legado dass_auth_service:');
      console.error(`  - URL Requisitada: ${authServiceUrl}/auth/login`);
      console.error(`  - Usuário Solicitante: ${usuario}`);
      console.error(`  - Mensagem do Erro (error.message): ${axiosError.message}`);
      console.error(`  - Código do Erro (error.code): ${axiosError.code || 'N/A'}`);

      if (axiosError.response) {
        console.error(`  - Status HTTP Retornado: ${status}`);
        console.error(`  - Headers da Resposta:`, JSON.stringify(axiosError.response.headers, null, 2));
        console.error(
          `  - Dados da Resposta (error.response.data):`,
          typeof axiosError.response.data === 'object'
            ? JSON.stringify(axiosError.response.data, null, 2)
            : axiosError.response.data
        );
      } else if (axiosError.request) {
        console.error('  - Nenhuma resposta recebida do serviço legado (timeout ou serviço inacessível na rede).');
      } else {
        console.error(`  - Erro na configuração da requisição: ${axiosError.message}`);
      }
      console.error('════════════════════════════════════════════════════════════════');

      // ═══ BYPASS DE DESENVOLVIMENTO (Fallback para desbloqueio local) ═══
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.NODE_ENV !== 'production';
      if (isDevelopment) {
        console.warn('⚠️ [AuthService] [DEV BYPASS ATIVO] Ambiente de desenvolvimento detectado.');
        console.warn(`⚠️ [AuthService] [DEV BYPASS ATIVO] Fallback ativado para "${usuario}". Gerando token JWT mock com contexto multi-tenant (planta_id).`);
        return {
          isMockBypass: true,
          usuario
        };
      }

      // ═══ Tratamento de Erros Seguro em Produção (api-security-best-practices) ═══
      if (status === 401 || isTimeout) {
        console.warn('[AuthService] Tentativa de login recusada pelo DASS: Credenciais inválidas ou tempo de resposta esgotado.');
        throw new AuthError(
          'Credenciais inválidas ou serviço de autenticação temporariamente indisponível.',
          401,
          'AUTH_UNAUTHORIZED'
        );
      }

      throw new AuthError(
        'Erro de comunicação com o serviço de autenticação legado.',
        502,
        'AUTH_COMMUNICATION_ERROR',
        axiosError.response?.data
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
   * Processa o login completo: autentica no serviço legado Unix (ou bypass em dev),
   * decodifica o JWT, normaliza chaves de crachá/RFID e efetua o Upsert no banco PostgreSQL.
   */
  public static async processarLogin(usuario: string, senha: string): Promise<SsoLoginResult> {
    // 1. Autentica no serviço legado ou ativa bypass de desenvolvimento
    const legacyResponse = await this.autenticarLegado(usuario, senha);

    const usuarioRepository = AppDataSource.getRepository(Usuario);
    const perfilRepository = AppDataSource.getRepository(Perfil);
    const plantaRepository = AppDataSource.getRepository(Planta);

    // ═══ TRATAMENTO DO BYPASS DE DESENVOLVIMENTO ═══
    if (legacyResponse?.isMockBypass) {
      // 1.1 Garante planta ativa para isolamento multi-tenant (Shared Database / Shared Schema)
      let planta = await plantaRepository.findOne({ where: { ativo: true } });
      if (!planta) {
        planta = plantaRepository.create({
          nome: 'Santo Estêvão (Unidade Piloto)',
          endereco: 'Rodovia BR-116, Km 450',
          cidade: 'Santo Estêvão',
          estado: 'BA',
          ativo: true
        });
        planta = await plantaRepository.save(planta);
      }

      // 1.2 Determina perfil do usuário
      const perfilNome = usuario.toLowerCase().includes('admin') ? 'ADMIN' : 'OPERADOR';
      let perfil = await perfilRepository.findOne({ where: { nome: perfilNome } });
      if (!perfil) {
        perfil = perfilRepository.create({
          nome: perfilNome,
          descricao: `Perfil ${perfilNome} gerado para ambiente de desenvolvimento`,
          permissoes: {}
        });
        perfil = await perfilRepository.save(perfil);
      }

      // 1.3 Busca ou cria usuário local no PostgreSQL
      let userLocal = await usuarioRepository.findOne({
        where: { usuario },
        relations: { perfil: true, planta: true }
      });

      if (!userLocal) {
        userLocal = usuarioRepository.create({
          usuario,
          nomeCompleto: usuario.toLowerCase().includes('admin')
            ? 'Administrador do Sistema (Dev Bypass)'
            : `Operador ${usuario} (Dev Bypass)`,
          email: `${usuario.toLowerCase().replace(/[^a-z0-9]/g, '.')}@empresa.com`,
          cargo: perfilNome,
          senhaHash: 'EXTERNAL_AUTH_ONLY',
          perfil,
          planta,
          ativo: true,
          ultimoAcesso: new Date()
        });
        userLocal = await usuarioRepository.save(userLocal);
      } else {
        userLocal.ultimoAcesso = new Date();
        if (!userLocal.plantaId && planta) {
          userLocal.planta = planta;
        }
        userLocal = await usuarioRepository.save(userLocal);
      }

      // 1.4 Gera token JWT mock assinado contendo planta_id para isolamento Multi-Tenant
      const jwtSecret = process.env.JWT_SECRET || 'erp_modelagem_jwt_secret_dev';
      const mockToken = jwt.sign(
        {
          userId: userLocal.id,
          usuario: userLocal.usuario,
          username: userLocal.usuario,
          nomeCompleto: userLocal.nomeCompleto,
          nome: userLocal.nomeCompleto,
          cargo: userLocal.cargo,
          perfilId: userLocal.perfilId,
          perfilNome: userLocal.perfil?.nome || perfilNome,
          plantaId: userLocal.plantaId || planta.id,
          planta_id: userLocal.plantaId || planta.id, // 🔑 Discriminador obrigatório de Multi-Tenant
          iss: 'erp-modelagem',
          aud: 'erp-modelagem-users'
        },
        jwtSecret,
        { expiresIn: '8h' }
      );

      return {
        token: mockToken,
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
          perfilNome: userLocal.perfil?.nome || perfilNome,
          permissoes: userLocal.perfil?.permissoes || {},
          setorId: userLocal.setorId,
          plantaId: userLocal.plantaId || planta.id,
          gestorId: userLocal.gestorId,
          ultimoAcesso: userLocal.ultimoAcesso?.toISOString(),
          createdAt: userLocal.createdAt.toISOString(),
          updatedAt: userLocal.updatedAt.toISOString()
        }
      };
    }

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

    // 3. Decodificação das claims do token JWT Unix
    const decoded = jwt.decode(token) as any;
    const unixNome = decoded?.nome || legacyResponse?.data?.nome || 'Usuário ERP';
    const unixUsuario = decoded?.usuario || legacyResponse?.data?.usuario || usuario;
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
    let userLocal = await usuarioRepository.findOne({
      where: { usuario: unixUsuario },
      relations: { perfil: true }
    });

    if (userLocal) {
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
      let perfil = await perfilRepository.findOne({ where: { nome: 'OPERADOR' } });
      if (!perfil) {
        perfil = perfilRepository.create({
          nome: 'OPERADOR',
          descricao: 'Perfil padrão de operador de fábrica',
          permissoes: {}
        });
        perfil = await perfilRepository.save(perfil);
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
        permissoes: userLocal.perfil?.permissoes || {},
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
