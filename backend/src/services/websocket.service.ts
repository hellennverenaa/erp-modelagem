import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

class WebSocketService {
  private io: Server | null = null;

  public init(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
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
