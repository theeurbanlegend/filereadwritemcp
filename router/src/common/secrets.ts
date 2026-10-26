import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const PLACEHOLDERS = ['change-me', 'changeme', 'secret', 'jwt_secret'];

export function jwtSecret(config: ConfigService): string {
  const secret = config.getOrThrow<string>('JWT_SECRET');
  const weak =
    secret.length < 32 ||
    PLACEHOLDERS.some((p) => secret.toLowerCase().includes(p));
  if (weak) {
    const message =
      'JWT_SECRET is weak: use at least 32 random characters, e.g. `openssl rand -hex 32`.';
    if (process.env.NODE_ENV === 'production') throw new Error(message);
    new Logger('Config').warn(message);
  }
  return secret;
}
