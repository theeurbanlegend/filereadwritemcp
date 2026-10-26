import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'apikey') {
  private readonly keys: string[];
  constructor(config: ConfigService) {
    super();
    this.keys = (config.get<string>('MCP_API_KEYS') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
  validate(req: Request): { userId: string; scopes: string[] } {
    const presented = this.extractKey(req);
    if (!presented || !this.matches(presented))
      throw new UnauthorizedException();
    return { userId: 'api-key', scopes: ['mcp:tools'] };
  }
  private extractKey(req: Request): string {
    const x = req.headers['x-api-key'];
    if (typeof x === 'string' && x) return x;
    const auth = req.headers['authorization'];
    return typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice(7)
      : '';
  }
  private matches(presented: string): boolean {
    const p = Buffer.from(presented);
    return this.keys.some((k) => {
      const b = Buffer.from(k);
      return b.length === p.length && timingSafeEqual(b, p); // constant-time
    });
  }
}
