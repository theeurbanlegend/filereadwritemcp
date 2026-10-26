import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Session } from '../../database/entities/session.entity';
import { SESSION_COOKIE, clearCookie, readCookie, setCookie } from './cookies';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly config: ConfigService,
  ) {}

  get secureCookies(): boolean {
    return this.config
      .getOrThrow<string>('OAUTH_ISSUER')
      .startsWith('https://');
  }

  async start(res: Response, userId: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.sessions.save(
      this.sessions.create({
        tokenHash: sha256(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      }),
    );
    setCookie(res, SESSION_COOKIE, token, SESSION_TTL_MS, this.secureCookies);
  }

  async userIdFor(req: Request): Promise<string | null> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const session = await this.sessions.findOne({
      where: { tokenHash: sha256(token) },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) return null;
    return session.userId;
  }

  async end(req: Request, res: Response): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.sessions.delete({ tokenHash: sha256(token) });
    clearCookie(res, SESSION_COOKIE, this.secureCookies);
  }

  async endAllForUser(userId: string): Promise<void> {
    await this.sessions.delete({ userId });
  }

  async pruneExpired(): Promise<void> {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
  }
}
