import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { RoutingModule } from '../routing/routing.module';
import { IdentityModule } from '../identity/identity.module';

// The router forwards every MCP tool call to the user's agent (via AgentRegistry,
// provided by RoutingModule). IdentityModule provides EnrollmentService, which the
// getAgents tool uses to list the caller's enrolled machines.
@Module({
  imports: [RoutingModule, IdentityModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
