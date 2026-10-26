import { Injectable, Logger } from '@nestjs/common';
import type { AgentConnection } from '../../common/agent-protocol';

// In-memory map of which agents are currently connected, keyed by userId.
// A user may enroll more than one machine, so each user holds a map of
// agentId -> connection. This is the networked cousin of the per-session
// transports Map in mcp.controller.ts.
@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private readonly byUser = new Map<string, Map<string, AgentConnection>>();

  register(conn: AgentConnection): void {
    let agents = this.byUser.get(conn.userId);
    if (!agents) {
      agents = new Map();
      this.byUser.set(conn.userId, agents);
    }
    // Drop any stale connection for the same machine before replacing it.
    agents.get(conn.agentId)?.close(4000, 'replaced by a newer connection');
    agents.set(conn.agentId, conn);
    this.logger.log(
      `Agent online: user=${conn.userId} agent=${conn.agentId} (${agents.size} for this user)`,
    );
  }

  unregister(userId: string, agentId: string): void {
    const agents = this.byUser.get(userId);
    if (!agents) return;
    agents.delete(agentId);
    if (agents.size === 0) this.byUser.delete(userId);
    this.logger.log(`Agent offline: user=${userId} agent=${agentId}`);
  }

  // All live agents for a user.
  list(userId: string): AgentConnection[] {
    return [...(this.byUser.get(userId)?.values() ?? [])];
  }

  // Resolve a specific machine, or the first available one for the user.
  get(userId: string, agentId?: string): AgentConnection | undefined {
    const agents = this.byUser.get(userId);
    if (!agents) return undefined;
    if (agentId) return agents.get(agentId);
    return agents.values().next().value as AgentConnection | undefined;
  }

  count(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }
}
