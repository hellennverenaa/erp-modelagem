import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
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
    this.io.use((socket: Socket, next) => {
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

        const decoded = jwt.verify(tokenStr, jwtSecret, { clockTolerance: 120 });
        (socket as any).data.user = decoded;
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

  public getIO(): Server {
    if (!this.io) {
      throw new Error('WebSocketService has not been initialized.');
    }
    return this.io;
  }

  public emit(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

export const webSocketService = new WebSocketService();
