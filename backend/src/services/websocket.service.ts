import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Usuario } from '../entities/Usuario';
import { Perfil } from '../entities/Perfil';
import { ehUsuarioAdminAutomacao, PERFIL_ADMIN_AUTOMACAO } from '../config/rbac.constants';
import { obterPermissoesGlobais } from './rbac.service';

const ROOMS_BY_EVENT: Record<string, string[]> = {
  'peca:avanco': ['screen:gerencial', 'screen:rastreamento'],
  'rastreamento:atualizado': ['screen:gerencial', 'screen:rastreamento'],
  'gargalo:update': ['screen:gerencial'],
};
import { isAllowedOrigin } from '../config/cors';

class WebSocketService {
  private io: Server | null = null;

  public init(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isAllowedOrigin(origin)) callback(null, true);
          else callback(new Error('Origem não autorizada para WebSocket.'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET não definido para autenticação do WebSocket.');
    }

    // Middleware de Handshake com Autenticação JWT
    this.io.use(async (socket: Socket, next) => {
      try {
        const tokenRaw =
          socket.handshake.auth?.token ||
          socket.handshake.query?.token ||
          socket.handshake.headers?.authorization;

        const tokenStr = String(tokenRaw || '').replace(/^Bearer\s+/i, '');

        if (!tokenStr) {
          console.warn(`[WebSocket Auth] Rejeitado — Token de autenticação ausente. Socket ID: ${socket.id}`);
          return next(new Error('TOKEN_EXPIRED'));
        }

        const decoded = jwt.verify(tokenStr, jwtSecret, { clockTolerance: 120 }) as jwt.JwtPayload & {
          usuario?: string;
          username?: string;
          userId?: string;
        };
        const username = String(decoded.usuario || decoded.username || decoded.userId || decoded.sub || '').trim().toLowerCase();
        if (!username) return next(new Error('AUTH_IDENTIFIER_INVALID'));

        const usuarioRepo = AppDataSource.getRepository(Usuario);
        let userLocal = await usuarioRepo.findOne({ where: { usuario: username }, relations: { perfil: true } });
        if (!userLocal || !userLocal.ativo) return next(new Error('AUTH_USER_INACTIVE'));

        if (ehUsuarioAdminAutomacao(userLocal.usuario) && userLocal.perfil?.nome?.trim().toUpperCase() !== PERFIL_ADMIN_AUTOMACAO) {
          const perfilAdminAutomacao = await AppDataSource.getRepository(Perfil).findOne({
            where: { nome: PERFIL_ADMIN_AUTOMACAO, ativo: true },
          });
          if (perfilAdminAutomacao) {
            userLocal.perfil = perfilAdminAutomacao;
            userLocal.perfilId = perfilAdminAutomacao.id;
            userLocal = await usuarioRepo.save(userLocal);
          }
        }

        if (!userLocal.perfil || !userLocal.perfil.ativo) return next(new Error('AUTH_PROFILE_INACTIVE'));

        const permissions = await obterPermissoesGlobais(userLocal.perfilId);
        const user = {
          ...decoded,
          userId: userLocal.id,
          usuario: userLocal.usuario,
          perfilId: userLocal.perfilId,
          perfilNome: userLocal.perfil.nome,
          plantaId: userLocal.plantaId,
          setorId: userLocal.setorId || undefined,
          permissoes: permissions,
        };

        socket.data.user = user;
        if (permissions.TELA_TORRE_CONTROLE === true) socket.join('screen:gerencial');
        if (permissions.TELA_RASTREAMENTO === true) socket.join('screen:rastreamento');
        next();
      } catch (err: any) {
        console.warn(`[WebSocket Auth] Rejeitado — Falha no token do Socket ID ${socket.id}:`, err.message);
        return next(new Error('TOKEN_EXPIRED'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Cliente autenticado e conectado: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
      });
    });

    return this.io;
  }

  public emit(event: string, data: any): void {
    const rooms = ROOMS_BY_EVENT[event];
    if (!this.io || !rooms?.length) return;
    this.io.to(rooms[0]).to(rooms[1] || rooms[0]).emit(event, data);
  }
}

export const webSocketService = new WebSocketService();
