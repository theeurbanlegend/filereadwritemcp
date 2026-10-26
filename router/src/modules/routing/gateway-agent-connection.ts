import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import type {
  AgentConnection,
  RouterToAgentMessage,
  ToolDescriptor,
} from '../../common/agent-protocol';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_CALL_TIMEOUT_MS = 60_000;

// Concrete AgentConnection backed by a socket.io Socket. Owns request/response
// correlation: call() emits a 'call' event and resolves when the matching
// 'result'/'error' arrives (or rejects on timeout / disconnect). The gateway's
// @SubscribeMessage handlers feed inbound events via resolve/reject/setTools.
export class GatewayAgentConnection implements AgentConnection {
  private readonly logger = new Logger(GatewayAgentConnection.name);
  readonly tools: ToolDescriptor[] = [];
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  constructor(
    private readonly socket: Socket,
    readonly userId: string,
    readonly agentId: string,
    readonly name: string,
  ) {}

  send(msg: RouterToAgentMessage): void {
    this.socket.emit(msg.type, msg);
  }

  close(): void {
    this.socket.disconnect(true);
  }

  call(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs: number = DEFAULT_CALL_TIMEOUT_MS,
  ): Promise<unknown> {
    const id = `${Date.now()}-${this.seq++}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Agent call timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ type: 'call', id, tool, args });
    });
  }

  // ---- fed by the gateway's @SubscribeMessage handlers ----
  resolvePending(id: string, result: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(result);
  }

  rejectPending(id: string, error: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.reject(new Error(error));
  }

  setTools(tools: ToolDescriptor[]): void {
    this.tools.splice(0, this.tools.length, ...tools);
    this.logger.log(`Agent ${this.agentId} advertised ${tools.length} tool(s)`);
  }

  // Reject all in-flight calls (called on disconnect).
  dispose(reason = 'Agent disconnected'): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
