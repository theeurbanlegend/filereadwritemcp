import type { Socket } from 'socket.io';
import { AgentGateway } from './agent.gateway';
import type { AgentRegistry } from './agent-registry';
import type { GatewayAgentConnection } from './gateway-agent-connection';
import type { EnrollmentService } from '../identity/enrollment.service';
import type { UpdatesService } from '../updates/updates.service';

interface Identity {
  userId: string;
  agentId: string;
  name: string;
}

function setup() {
  let finishAuth: (identity: Identity) => void = () => undefined;
  const auth = new Promise<Identity>((resolve) => {
    finishAuth = resolve;
  });
  const registered: GatewayAgentConnection[] = [];
  const registry = {
    register: (conn: GatewayAgentConnection) => registered.push(conn),
    unregister: () => undefined,
  } as unknown as AgentRegistry;
  const enrollment = {
    authenticateAgent: () => auth,
  } as unknown as EnrollmentService;
  const offers: string[] = [];
  const updates = {
    updateOfferFor: (version?: string) => {
      offers.push(version ?? '');
      return { version: '9.9.9', sha256: 'abc' };
    },
  } as unknown as UpdatesService;
  const emitted: string[] = [];
  const client = {
    id: 'socket-1',
    disconnected: false,
    handshake: { auth: { token: 't' }, headers: {}, address: '10.0.0.1' },
    emit: (event: string) => emitted.push(event),
    disconnect: () => undefined,
  } as unknown as Socket;
  const gateway = new AgentGateway(registry, enrollment, updates);
  return { gateway, client, finishAuth, registered, offers, emitted };
}

describe('AgentGateway', () => {
  it('keeps the tool list from a hello that arrives before authentication finishes', async () => {
    const { gateway, client, finishAuth, registered, offers, emitted } =
      setup();
    const connecting = gateway.handleConnection(client);
    const hello = gateway.onHello(client, {
      agentVersion: '1.0.6',
      target: 'x86_64-pc-windows-msvc',
      tools: [{ name: 'readFile' }, { name: 'getFileInfo' }],
    });
    finishAuth({ userId: 'u', agentId: 'a', name: 'pc' });
    await connecting;
    await hello;

    expect(registered).toHaveLength(1);
    expect(registered[0].tools.map((t) => t.name)).toEqual([
      'readFile',
      'getFileInfo',
    ]);
    expect(offers).toEqual(['1.0.6']);
    expect(emitted).toEqual(['update-available']);
  });

  it('ignores a hello from a connection that never authenticated', async () => {
    const { gateway, client } = setup();
    await expect(
      gateway.onHello(client, { tools: [{ name: 'readFile' }] }),
    ).resolves.toBeUndefined();
  });
});
