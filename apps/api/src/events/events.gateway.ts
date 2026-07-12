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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private logger: Logger = new Logger('EventsGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_queue')
  handleSubscribeQueue(client: Socket, @MessageBody() queueId: string) {
    client.join(`queue_${queueId}`);
    return { event: 'subscribed', data: queueId };
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
