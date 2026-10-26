import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { CreateUserCommand } from './create-user.command';
import { CreateEnrollmentCommand } from './create-enrollment.command';

// Standalone module for the admin CLI. Boots the DB connection (via DatabaseModule)
// and the identity services (via IdentityModule), then runs the requested command.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    DatabaseModule,
    IdentityModule,
  ],
  providers: [CreateUserCommand, CreateEnrollmentCommand],
})
export class CliModule {}
