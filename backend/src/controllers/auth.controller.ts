import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { Planta } from '../entities/Planta';

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
  public async login(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { usuario, senha } = req.body;

      if (!usuario || !senha) {
        return res.status(400).json({
          error: 'Usuário e senha são obrigatórios.',
          code: 'AUTH_MISSING_CREDENTIALS'
        });
      }

      // Conexão de rede via variável de ambiente (Zero Hardcode)
      const authServiceUrl = process.env.DASS_AUTH_URL || process.env.AUTH_SERVICE_URL;
      if (!authServiceUrl) {
        return res.status(500).json({
          error: 'A variável de ambiente DASS_AUTH_URL ou AUTH_SERVICE_URL não está configurada.',
          code: 'AUTH_SERVICE_URL_MISSING'
        });
      }

      let response;
      try {
        response = await axios.post(`${authServiceUrl}/auth/login`, 
          { usuario, senha },
          { timeout: 5000 }
        );
        console.log('[AuthController] Payload retornado pelo SSO Unix:', JSON.stringify(response.data, null, 2));
      } catch (axiosError: any) {
        const status = axiosError.response?.status;
        const isTimeout = axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout');

        if (status === 401 || isTimeout) {
          console.warn('[AuthController] Tentativa de login recusada pelo DASS: Credenciais inválidas ou tempo de resposta esgotado.');
          return res.status(401).json({
            error: 'Credenciais inválidas ou serviço de autenticação temporariamente indisponível.',
            code: 'AUTH_UNAUTHORIZED'
          });
        }

        console.error('[AuthController] Falha de comunicação com o serviço de autenticação DASS:', axiosError.message || axiosError);

        return res.status(502).json({
          error: 'Erro de comunicação com o serviço de autenticação legado.',
          code: 'AUTH_COMMUNICATION_ERROR'
        });
      }

      // Extração dinâmica do token suportando aninhamento no payload do Unix
      const token = response.data?.data?.token || response.data?.token || response.data?.data?.accessToken || response.data?.accessToken;
      if (!token) {
        return res.status(401).json({
          error: 'Token não retornado pelo serviço de autenticação.',
          code: 'AUTH_TOKEN_MISSING'
        });
      }

      // Decodificação para ler as claims do Unix
      const decoded = jwt.decode(token) as any;
      
      const unixNome = decoded?.nome || response.data?.data?.nome || 'Usuário ERP';
      const unixUsuario = decoded?.usuario || response.data?.data?.usuario || usuario;
      const unixFuncao = decoded?.funcao || 'Operador';

      // Extração agnóstica das chaves duplas de crachá (RFID e Código de Barras) vindo da matriz DASS_AUTH_SERVICE
      const rawRfid =
        decoded?.rfid ||
        decoded?.chip_rfid ||
        decoded?.rfid_chip ||
        response.data?.data?.rfid ||
        response.data?.rfid ||
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
        response.data?.data?.codbarras ||
        response.data?.data?.codigo_barras ||
        response.data?.data?.codigoBarrasCracha ||
        response.data?.data?.codigo_barras_cracha ||
        response.data?.data?.codigoCracha ||
        response.data?.data?.codigoCrachao ||
        response.data?.data?.cracha ||
        response.data?.codbarras ||
        response.data?.codigo_barras ||
        response.data?.codigoBarrasCracha ||
        response.data?.codigoCracha ||
        response.data?.codigoCrachao ||
        response.data?.cracha ||
        null;

      const unixRfid    = rawRfid ? Usuario.normalizarCodigoCrachao(String(rawRfid)) || null : null;
      const unixBarcode = rawBarcode ? Usuario.normalizarCodigoCrachao(String(rawBarcode)) || null : null;

      let unixEmail = null;
      if (decoded?.matricula) {
        try {
          const emailResponse = await axios.get(`${authServiceUrl}/user/email/${decoded.matricula}`, {
            timeout: 5000
          });
          unixEmail = emailResponse.data?.email || null;
        } catch (emailError: any) {
          console.warn('[AuthController] Não foi possível buscar o e-mail do usuário no legado:', emailError.message || emailError);
        }
      }

      const usuarioRepository = AppDataSource.getRepository(Usuario);
      const perfilRepository = AppDataSource.getRepository(Perfil);
      const plantaRepository = AppDataSource.getRepository(Planta);

      // Upsert: Busca o usuário local na tabela pelo nome de usuário com relacionamento de perfil
      let userLocal = await usuarioRepository.findOne({
        where: { usuario: unixUsuario },
        relations: { perfil: true }
      });

      if (userLocal) {
        // Se o usuário já existir, atualiza dados cadastrais e as chaves de crachá espelhadas
        userLocal.nomeCompleto = unixNome;
        if (unixEmail) userLocal.email = unixEmail;
        userLocal.cargo = unixFuncao;
        if (unixRfid) userLocal.rfid = unixRfid;
        if (unixBarcode) {
          userLocal.codigoBarrasCracha = unixBarcode;
          userLocal.codigoCrachao      = unixBarcode;
          userLocal.codigoCracha       = unixBarcode;
        }
        userLocal.ultimoAcesso = new Date();
        userLocal = await usuarioRepository.save(userLocal);
        
        userLocal = await usuarioRepository.findOne({
          where: { id: userLocal.id },
          relations: { perfil: true }
        }) || userLocal;
      } else {
        // Se o usuário for novo, busca o perfil padrão 'OPERADOR' e a primeira planta ativa
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
          senhaHash: 'EXTERNAL_AUTH_ONLY', // Marcada como EXTERNAL_AUTH_ONLY para login gerenciado no Unix
          perfil,
          planta,
          ativo: true,
          ultimoAcesso: new Date()
        });

        userLocal = await usuarioRepository.save(userLocal);
      }

      // Resposta Final
      return res.json({
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
      });
    } catch (error) {
      next(error);
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

  /**
   * Valida credenciais de crachá/RFID de forma agnóstica a hardware (Chaves Duplas RFID e Barcode).
   * POST /api/auth/validar-cracha
   */
  public async validarCracha(req: Request, res: Response): Promise<Response> {
    try {
      const { codigoCredencial } = req.body;

      if (!codigoCredencial || typeof codigoCredencial !== 'string') {
        return res.status(400).json({
          error: 'O campo codigoCredencial é obrigatório.',
          code: 'CREDENTIAL_REQUIRED'
        });
      }

      const codigoLimpo = Usuario.normalizarCodigoCrachao(codigoCredencial);
      if (!codigoLimpo) {
        return res.status(400).json({
          error: 'Código de credencial inválido ou vazio.',
          code: 'INVALID_CREDENTIAL_FORMAT'
        });
      }

      // Validação de tipo de dado para evitar Erro 42883 (UUID vs Varchar) no PostgreSQL
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
        return res.status(404).json({
          error: 'Credencial de gestor/coordenador inválida ou crachá não cadastrado.',
          code: 'CREDENCIAL_INVALIDA'
        });
      }

      if (!user.ativo) {
        return res.status(403).json({
          error: 'Usuário associado a este crachá está inativo.',
          code: 'USUARIO_INATIVO'
        });
      }

      return res.json({
        message: 'Credencial de gestor/coordenador validada com sucesso.',
        usuario: {
          id: user.id,
          nomeCompleto: user.nomeCompleto,
          cargo: user.cargo,
          perfilId: user.perfilId,
          perfilNome: user.perfil?.nome || null,
          setorId: user.setorId
        }
      });
    } catch (error: any) {
      console.error('[AuthController.validarCracha] Erro no banco de dados:', error);
      return res.status(500).json({
        error: error.message || 'Erro interno de banco de dados ao validar crachá.',
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}
