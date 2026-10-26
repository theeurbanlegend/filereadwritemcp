import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { RefreshToken } from '../../database/entities/refresh-token.entity';

interface CodeRec {
  redirectUri: string;
  challenge: string;
  scope: string;
  userId: string;
  clientId: string;
  exp: number;
}

@Injectable()
export class OAuthService {
  // Auth codes stay in-memory: they live ~60s, so a restart's blast radius is
  // negligible. Refresh tokens are PERSISTED (below) so restarts don't force re-login.
  private codes = new Map<string, CodeRec>();

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  verifyPkce(verifier: string, challenge: string): boolean {
    const computed = createHash('sha256').update(verifier).digest('base64url'); // S256
    const a = Buffer.from(computed),
      b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b); // constant-time
  }

  issueCode(
    redirectUri: string,
    challenge: string,
    scope: string,
    userId: string,
    clientId: string,
  ): string {
    const code = randomBytes(32).toString('base64url');
    this.codes.set(code, {
      redirectUri,
      challenge,
      scope,
      userId,
      clientId,
      exp: Date.now() + 60_000,
    }); // 60s
    return code;
  }
  pruneExpiredCodes(): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, rec] of this.codes) {
      if (rec.exp < now) {
        this.codes.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  consumeCode(code: string): CodeRec | null {
    const rec = this.codes.get(code);
    this.codes.delete(code); // single-use
    return rec && rec.exp >= Date.now() ? rec : null;
  }

  // Persisted in Postgres so a router restart doesn't invalidate refresh tokens.
  // Only the sha256 hash is stored; the raw token is returned to the client once.
  async issueRefresh(
    scope: string,
    userId: string,
    clientId: string,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttl = Number(this.config.get('REFRESH_TOKEN_TTL') ?? 2_592_000);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        tokenHash: this.hashToken(token),
        userId,
        scope,
        clientId,
        expiresAt: new Date(Date.now() + ttl * 1000),
      }),
    );
    return token;
  }

  // Single-use: the row is deleted on consume (rotation), whether or not it was valid.
  async consumeRefresh(token: string): Promise<{
    scope: string;
    userId: string;
    clientId: string | null;
  } | null> {
    const tokenHash = this.hashToken(token);
    const rec = await this.refreshTokens.findOne({ where: { tokenHash } });
    await this.refreshTokens.delete({ tokenHash });
    if (!rec || rec.expiresAt.getTime() < Date.now()) return null;
    return { scope: rec.scope, userId: rec.userId, clientId: rec.clientId };
  }

  async activeClientsForUser(userId: string) {
    const rows = await this.refreshTokens
      .createQueryBuilder('t')
      .select('t.clientId', 'clientId')
      .addSelect('MAX(t.createdAt)', 'lastUsedAt')
      .addSelect('MAX(t.expiresAt)', 'expiresAt')
      .where('t.userId = :userId', { userId })
      .andWhere('t.expiresAt > now()')
      .groupBy('t.clientId')
      .orderBy('"lastUsedAt"', 'DESC')
      .getRawMany<{
        clientId: string | null;
        lastUsedAt: Date;
        expiresAt: Date;
      }>();
    return rows;
  }

  async revokeClientForUser(userId: string, clientId: string | null) {
    await this.refreshTokens
      .createQueryBuilder()
      .delete()
      .where('userId = :userId', { userId })
      .andWhere(
        clientId === null ? '"clientId" IS NULL' : '"clientId" = :clientId',
        { clientId },
      )
      .execute();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.delete({ userId });
  }

  signAccessToken(scope: string, userId: string) {
    const expiresIn = Number(this.config.get('ACCESS_TOKEN_TTL') ?? 3600);
    const token = this.jwt.sign(
      { sub: userId, scope },
      {
        audience: this.config.getOrThrow('MCP_RESOURCE_URL'),
        issuer: this.config.getOrThrow('OAUTH_ISSUER'),
        expiresIn,
      },
    );
    return { token, expiresIn };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
