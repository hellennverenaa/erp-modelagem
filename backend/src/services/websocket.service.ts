import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

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

    this.io.on('connection', (socket) => {
      console.log(`Client connected to WebSocket: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`Client disconnected from WebSocket: ${socket.id}`);
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
