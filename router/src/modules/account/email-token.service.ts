import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import {
  EmailToken,
  type EmailTokenPurpose,
} from '../../database/entities/email-token.entity';

const TTL_MS: Record<EmailTokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};
const RESEND_COOLDOWN_MS = 60_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class EmailTokenService {
  constructor(
    @InjectRepository(EmailToken)
    private readonly tokens: Repository<EmailToken>,
  ) {}

  async issue(
    userId: string,
    purpose: EmailTokenPurpose,
  ): Promise<string | null> {
    const recent = await this.tokens.count({
      where: {
        userId,
        purpose,
        createdAt: MoreThan(new Date(Date.now() - RESEND_COOLDOWN_MS)),
      },
    });
    if (recent > 0) return null;
    await this.tokens.delete({ userId, purpose });
    const token = randomBytes(32).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        tokenHash: sha256(token),
        userId,
        purpose,
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      }),
    );
    return token;
  }

  async consume(
    token: string,
    purpose: EmailTokenPurpose,
  ): Promise<string | null> {
    const tokenHash = sha256(token);
    const rec = await this.tokens.findOne({ where: { tokenHash, purpose } });
    if (!rec) return null;
    await this.tokens.delete({ tokenHash });
    return rec.expiresAt.getTime() < Date.now() ? null : rec.userId;
  }
}
