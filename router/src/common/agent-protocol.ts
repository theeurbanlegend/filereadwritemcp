// Wire protocol between the central router and each per-PC agent (over WebSocket).
// Shared by the router's AgentGateway and the agent client so both ends agree
// on the message shapes. JSON-encoded on the wire.

export type RequestId = string;

export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

// ---- Router -> Agent ----
export interface CallToolMessage {
  type: 'call';
  id: RequestId;
  tool: string;
  args: Record<string, unknown>;
}
export interface ListToolsMessage {
  type: 'list';
  id: RequestId;
}
// Tells the agent a newer build is available; the agent pulls it from the router
// (GET /agent/update/download) and verifies it against this sha256.
export interface UpdateAvailableMessage {
  type: 'update-available';
  version: string;
  sha256: string;
}
export type RouterToAgentMessage =
  | CallToolMessage
  | ListToolsMessage
  | UpdateAvailableMessage;

// ---- Agent -> Router ----
// Sent by the agent right after connecting: advertises what it can do.
// `target` is the agent's build triple (e.g. aarch64-apple-darwin); newer agents
// include it so the router can offer an update inline on connect.
export interface HelloMessage {
  type: 'hello';
  agentVersion: string;
  target?: string;
  tools: ToolDescriptor[];
}
// Periodic poll from a long-lived agent asking whether a newer build exists.
export interface CheckUpdateMessage {
  type: 'check-update';
  agentVersion: string;
  target: string;
}
export interface ResultMessage {
  type: 'result';
  id: RequestId;
  ok: true;
  result: unknown; // CallToolResult-shaped payload from the local tool
}
export interface ErrorMessage {
  type: 'error';
  id: RequestId;
  ok: false;
  error: string;
}
export type AgentToRouterMessage =
  | HelloMessage
  | CheckUpdateMessage
  | ResultMessage
  | ErrorMessage;

export type WireMessage = RouterToAgentMessage | AgentToRouterMessage;

// Router-side handle to one connected agent. Implemented by the gateway (wrapping
// the ws socket) and consumed by the registry/forwarder — kept abstract so the
// registry has no dependency on the WebSocket library.
export interface AgentConnection {
  readonly userId: string;
  readonly agentId: string;
  readonly name: string;
  readonly tools: ToolDescriptor[];
  // Send a tool call and resolve with its result (reject on error or timeout).
  call(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
  send(msg: RouterToAgentMessage): void;
  close(code?: number, reason?: string): void;
}
