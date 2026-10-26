import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface McpUser {
  userId: string;
  scopes: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
      issuer: config.getOrThrow('OAUTH_ISSUER'),
      audience: config.getOrThrow('MCP_RESOURCE_URL'),
      algorithms: ['HS256'],
    });
  }
  validate(payload: { sub: string; scope?: unknown }): McpUser {
    return {
      userId: payload.sub,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
    };
  }
}
