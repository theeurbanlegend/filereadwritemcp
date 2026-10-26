import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { AgentRegistry } from './agent-registry';
import { GatewayAgentConnection } from './gateway-agent-connection';
import { EnrollmentService } from '../identity/enrollment.service';
import { UpdatesService } from '../updates/updates.service';
import type { ToolDescriptor } from '../../common/agent-protocol';

// socket.io namespace the per-PC agents dial into: /agent.
// Authenticates the agent token on connect, registers the connection, and
// routes inbound events to it. Agents dial OUT, so this works behind NAT.
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const CONNECTS_PER_MINUTE = 20;

@WebSocketGateway({ namespace: '/agent', maxHttpBufferSize: MAX_MESSAGE_BYTES })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);
  private readonly connections = new Map<string, GatewayAgentConnection>();
  private readonly connectAttempts = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly enrollment: EnrollmentService,
    private readonly updates: UpdatesService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    if (!this.allowConnect(this.clientIp(client))) {
      client.disconnect(true);
      return;
    }
    try {
      const token = this.extractToken(client);
      const { userId, agentId, name } =
        await this.enrollment.authenticateAgent(token);
      const conn = new GatewayAgentConnection(client, userId, agentId, name);
      this.connections.set(client.id, conn);
      this.registry.register(conn);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rejected agent connection: ${message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const conn = this.connections.get(client.id);
    if (!conn) return;
    conn.dispose();
    this.registry.unregister(conn.userId, conn.agentId);
    this.connections.delete(client.id);
  }

  @SubscribeMessage('hello')
  onHello(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { agentVersion?: string; target?: string; tools?: ToolDescriptor[] },
  ): void {
    const conn = this.connections.get(client.id);
    if (!conn) return;
    conn.setTools(body?.tools ?? []);
    // Newer agents include `target` in hello, so we can offer an update inline.
    this.offerUpdate(conn, body?.agentVersion, body?.target);
  }

  @SubscribeMessage('check-update')
  onCheckUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { agentVersion?: string; target?: string },
  ): void {
    const conn = this.connections.get(client.id);
    if (!conn) return;
    this.offerUpdate(conn, body?.agentVersion, body?.target);
  }

  private offerUpdate(
    conn: GatewayAgentConnection,
    agentVersion?: string,
    target?: string,
  ): void {
    const offer = this.updates.updateOfferFor(agentVersion, target);
    if (!offer) return;
    conn.send({
      type: 'update-available',
      version: offer.version,
      sha256: offer.sha256,
    });
    this.logger.log(
      `Offered update v${offer.version} to agent ${conn.agentId} (${target})`,
    );
  }

  @SubscribeMessage('result')
  onResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { id: string; result: unknown },
  ): void {
    this.connections.get(client.id)?.resolvePending(body.id, body.result);
  }

  @SubscribeMessage('error')
  onError(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { id: string; error: string },
  ): void {
    this.connections.get(client.id)?.rejectPending(body.id, body.error);
  }

  private clientIp(client: Socket): string {
    const forwarded = client.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(',')[0]
      ?.trim();
    return first || client.handshake.address;
  }

  private allowConnect(ip: string): boolean {
    const now = Date.now();
    if (this.connectAttempts.size > 10_000) {
      for (const [key, w] of this.connectAttempts) {
        if (now - w.start >= 60_000) this.connectAttempts.delete(key);
      }
    }
    const window = this.connectAttempts.get(ip);
    if (!window || now - window.start >= 60_000) {
      this.connectAttempts.set(ip, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    if (window.count === CONNECTS_PER_MINUTE + 1) {
      this.logger.warn(`Throttling agent connections from ${ip}`);
    }
    return window.count <= CONNECTS_PER_MINUTE;
  }

  private extractToken(client: Socket): string {
    const auth = client.handshake.auth?.token as string | undefined;
    if (typeof auth === 'string' && auth) return auth;
    const header = client.handshake.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    throw new Error('missing agent token');
  }
}
