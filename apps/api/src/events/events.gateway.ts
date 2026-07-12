import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : false,
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private logger: Logger = new Logger('EventsGateway');

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  async handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connecting: ${client.id}`);

    let token: string | undefined;

    // 1. Auth object (standard for socket.io v4)
    if (client.handshake.auth?.token) {
      token = client.handshake.auth.token;
    } else if (client.handshake.auth?.authorization) {
      token = client.handshake.auth.authorization;
    }

    // 2. Query parameters
    if (!token && client.handshake.query) {
      token = (client.handshake.query.token ||
        client.handshake.query.authorization) as string;
    }

    // 3. Headers
    if (!token && client.handshake.headers) {
      const authHeader = client.handshake.headers.authorization;
      if (authHeader) {
        token = authHeader;
      }
    }

    // Extract bearer prefix if exists
    if (token && token.startsWith('Bearer ')) {
      token = token.substring(7);
    }

    if (!token) {
      this.logger.warn(
        `No token provided by client: ${client.id}. Disconnecting.`,
      );
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.authService.verifyToken(token);
      (client as any).user = payload;
      this.logger.log(
        `Client authenticated successfully: ${client.id} (user: ${payload.sub || payload.orgId})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Authentication failed for client: ${client.id}. Error: ${err.message}. Disconnecting.`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_queue')
  async handleSubscribeQueue(client: Socket, @MessageBody() queueId: string) {
    const user = (client as any).user;
    if (!user || !user.orgId) {
      this.logger.warn(
        `Unauthorized subscription attempt by client: ${client.id}`,
      );
      return { event: 'error', data: 'Unauthorized' };
    }

    try {
      const queue = await this.prisma.queue.findUnique({
        where: { id: queueId },
        include: { project: true },
      });

      if (!queue || queue.project.org_id !== user.orgId) {
        this.logger.warn(
          `User ${user.userId || user.sub} is not authorized to subscribe to queue ${queueId}`,
        );
        return { event: 'error', data: 'Unauthorized' };
      }

      client.join(`queue_${queueId}`);
      return { event: 'subscribed', data: queueId };
    } catch (err: any) {
      this.logger.error(`Error subscribing to queue: ${err.message}`);
      return { event: 'error', data: 'Internal error' };
    }
  }

  @SubscribeMessage('unsubscribe_queue')
  handleUnsubscribeQueue(client: Socket, @MessageBody() queueId: string) {
    client.leave(`queue_${queueId}`);
    return { event: 'unsubscribed', data: queueId };
  }

  // Method to be called by other services to broadcast events
  broadcastJobUpdate(queueId: string, eventName: string, payload: any) {
    this.server.to(`queue_${queueId}`).emit(eventName, payload);
  }
}
