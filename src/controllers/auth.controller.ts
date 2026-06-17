import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { Planta } from '../entities/Planta';

export class AuthController {
  /**
   * Realiza a autenticação integrando com o dass_auth_service legado.
   * Faz o upsert local do usuário mantendo o espelho de dados sincronizado.
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

      // Conexão de rede Docker via variável de ambiente (Zero Hardcode)
      const dassAuthUrl = process.env.DASS_AUTH_URL || 'http://dass-auth-service:2399';

      let response;
      try {
        response = await axios.post(`${dassAuthUrl}/auth/login`, { usuario, senha });
      } catch (axiosError) {
        // Captura credenciais inválidas ou falha de comunicação com a API legada (Unix)
        return res.status(401).json({
          error: 'Credenciais inválidas ou serviço de autenticação indisponível.',
          code: 'AUTH_INVALID_CREDENTIALS'
        });
      }

      // Extração dinâmica do token suportando aninhamento em response.data.data.token
      const token = response.data?.data?.token || response.data?.token || response.data?.data?.accessToken || response.data?.accessToken;
      if (!token) {
        return res.status(401).json({
          error: 'Token não retornado pelo serviço de autenticação.',
          code: 'AUTH_TOKEN_MISSING'
        });
      }

      // Decodificação para ler as claims do Unix
      const decoded = jwt.decode(token) as any;
      
      // Dados do usuário obtidos a partir da API legada (aninhado) ou do token decodificado (fallback)
      const apiUsuario = response.data?.data?.usuario || response.data?.usuario;

      const unixNome = apiUsuario?.nomeCompleto || apiUsuario?.nome || apiUsuario?.name || decoded?.nomeCompleto || decoded?.nome || decoded?.name || 'Usuário ERP';
      const unixUsuario = apiUsuario?.usuario || apiUsuario?.username || apiUsuario?.userId || decoded?.usuario || decoded?.username || decoded?.userId || usuario;
      const unixEmail = apiUsuario?.email || decoded?.email || null;
      const unixFuncao = apiUsuario?.cargo || apiUsuario?.funcao || decoded?.cargo || decoded?.funcao || 'Operador';

      const usuarioRepository = AppDataSource.getRepository(Usuario);
      const perfilRepository = AppDataSource.getRepository(Perfil);
      const plantaRepository = AppDataSource.getRepository(Planta);

      // Upsert: Busca o usuário local na tabela
      let userLocal = await usuarioRepository.findOne({
        where: { usuario: unixUsuario },
        relations: { perfil: true, planta: true }
      });

      if (userLocal) {
        // Atualiza dados cadastrais
        userLocal.nomeCompleto = unixNome;
        userLocal.email = unixEmail;
        userLocal.cargo = unixFuncao;
        userLocal.ultimoAcesso = new Date();
        userLocal = await usuarioRepository.save(userLocal);
      } else {
        // Cria usuário vinculando Perfil e Planta obrigatórios sem hardcode de Admin/Gerente
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
          senhaHash: 'EXTERNAL_AUTH_ONLY', // Senha gerenciada externamente no Unix
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
          ativo: userLocal.ativo,
          perfilId: userLocal.perfilId,
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
}
