import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailToken } from '../../database/entities/email-token.entity';
import { IdentityModule } from '../identity/identity.module';
import { RoutingModule } from '../routing/routing.module';
import { OAuthModule } from '../oauth/oauth.module';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { AccountController } from './account.controller';
import { EmailTokenService } from './email-token.service';
import { EmailService } from './email.service';
import { GithubAuthService } from './github.service';
import { LoginAttemptsService } from './login-attempts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailToken]),
    IdentityModule,
    RoutingModule,
    OAuthModule,
    SessionModule,
  ],
  controllers: [AuthController, AccountController],
  providers: [
    EmailTokenService,
    EmailService,
    GithubAuthService,
    LoginAttemptsService,
  ],
})
export class AccountModule {}
