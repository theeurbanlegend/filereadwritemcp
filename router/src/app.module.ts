import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { jwtSecret } from './common/secrets';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { OAuthModule } from './modules/oauth/oauth.module';
import { McpModule } from './modules/mcp/mcp.module';
import { DatabaseModule } from './database/database.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RoutingModule } from './modules/routing/routing.module';
import { UpdatesModule } from './modules/updates/updates.module';
import { AccountModule } from './modules/account/account.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { JwtStrategy } from './common/strategies/jwt.strategy';
import { WwwAuthenticateFilter } from './common/filters/unauthorized.filter';
import { ApiKeyStrategy } from './common/strategies/apiKey.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: jwtSecret(c),
        signOptions: { algorithm: 'HS256' },
        global: true,
      }),
    }),
    DatabaseModule,
    OAuthModule,
    McpModule,
    IdentityModule,
    RoutingModule,
    UpdatesModule,
    AccountModule,
    MaintenanceModule,
  ],
  controllers: [],
  providers: [
    JwtStrategy,
    ApiKeyStrategy,
    WwwAuthenticateFilter,
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule {}
