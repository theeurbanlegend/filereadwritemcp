import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Catch(UnauthorizedException)
export class WwwAuthenticateFilter implements ExceptionFilter {
  constructor(private config: ConfigService) {}
  catch(_ex: UnauthorizedException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const prm = `${this.config.getOrThrow('OAUTH_ISSUER')}/.well-known/oauth-protected-resource`;
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${prm}"`); // RFC 9728 §5.1
    res.status(401).json({ error: 'unauthorized' });
  }
}
