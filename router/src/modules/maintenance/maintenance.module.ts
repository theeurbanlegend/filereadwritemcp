import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { MaintenanceService } from './maintenance.service';
import { HealthController } from './health.controller';

@Module({
  imports: [OAuthModule],
  controllers: [HealthController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
