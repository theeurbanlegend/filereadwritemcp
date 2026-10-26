import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OAuthService } from '../oauth/oauth.service';

const INTERVAL_MS = 6 * 60 * 60_000;
const UNUSED_CLIENT_DAYS = 30;

@Injectable()
export class MaintenanceService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: DataSource,
    private readonly oauth: OAuthService,
  ) {}

  onApplicationBootstrap(): void {
    setTimeout(() => void this.run(), 60_000).unref();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const steps: [string, string][] = [
      ['sessions', `DELETE FROM "sessions" WHERE "expiresAt" < now()`],
      ['email_tokens', `DELETE FROM "email_tokens" WHERE "expiresAt" < now()`],
      [
        'refresh_tokens',
        `DELETE FROM "refresh_tokens" WHERE "expiresAt" < now()`,
      ],
      [
        'enrollment_codes',
        `DELETE FROM "enrollment_codes" WHERE "expiresAt" < now() - interval '1 day'`,
      ],
      [
        'oauth_clients',
        `DELETE FROM "oauth_clients" c WHERE c."createdAt" < now() - interval '${UNUSED_CLIENT_DAYS} days'
         AND NOT EXISTS (SELECT 1 FROM "refresh_tokens" t WHERE t."clientId" = c."id")`,
      ],
    ];
    try {
      for (const [name, sql] of steps) {
        const result: unknown = await this.db.query(sql);
        counts[name] = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      }
      counts.oauth_codes = this.oauth.pruneExpiredCodes();
      const removed = Object.entries(counts).filter(([, n]) => n > 0);
      if (removed.length) {
        this.logger.log(
          `Pruned ${removed.map(([k, n]) => `${n} ${k}`).join(', ')}`,
        );
      }
    } catch (err) {
      this.logger.error(`Maintenance failed: ${String(err)}`);
    }
    return counts;
  }
}
