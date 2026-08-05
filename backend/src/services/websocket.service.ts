import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

class WebSocketService {
  private io: Server | null = null;

  public init(httpServer: HttpServer): Server {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:5174',
    ];

    if (process.env.CORS_ALLOWED_ORIGINS) {
      process.env.CORS_ALLOWED_ORIGINS.split(',').forEach(o => {
        const trimmed = o.trim();
        if (trimmed && !allowedOrigins.includes(trimmed)) {
          allowedOrigins.push(trimmed);
        }
      });
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    const jwtSecret = process.env.JWT_SECRET || 'erp_modelagem_secret_key_2026';

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
