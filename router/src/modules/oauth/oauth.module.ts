import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthClientService } from './oauth-client.service';
import { OAuthClient } from '../../database/entities/oauthclient.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [
    SessionModule,
    TypeOrmModule.forFeature([OAuthClient, RefreshToken]),
  ],
  controllers: [OAuthController],
  providers: [OAuthService, OAuthClientService],
  exports: [OAuthService, OAuthClientService],
})
export class OAuthModule {}
