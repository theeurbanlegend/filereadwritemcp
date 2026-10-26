import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { UpdatesService } from './updates.service';
import { UpdateController } from './update.controller';
import { AgentAuthGuard } from './agent-auth.guard';

// Serves agent self-updates: caches the latest GitHub release (via webhook +
// startup refresh) and hands signed binaries to authenticated agents. Pull-based,
// so it never imports RoutingModule — agents discover updates via check-update /
// hello, which the gateway answers using UpdatesService.
@Module({
  imports: [IdentityModule], // EnrollmentService for AgentAuthGuard
  controllers: [UpdateController],
  providers: [UpdatesService, AgentAuthGuard],
  exports: [UpdatesService],
})
export class UpdatesModule {}
