import { Module } from '@nestjs/common';
import { AgentRegistry } from './agent-registry';
import { AgentGateway } from './agent.gateway';
import { IdentityModule } from '../identity/identity.module';
import { UpdatesModule } from '../updates/updates.module';

// Router-side agent connectivity: the WebSocket gateway agents dial into, and
// the registry of who is currently connected. Imports UpdatesModule so the
// gateway can answer hello / check-update with an update offer (pull-based).
@Module({
  imports: [IdentityModule, UpdatesModule],
  providers: [AgentRegistry, AgentGateway],
  exports: [AgentRegistry],
})
export class RoutingModule {}
