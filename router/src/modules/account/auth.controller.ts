import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../identity/users.service';
import { SessionService } from '../session/session.service';
import {
  clearCookie,
  readCookie,
  safeNext,
  setCookie,
} from '../session/cookies';
import { EmailTokenService } from './email-token.service';
import { EmailService } from './email.service';
import { GithubAuthService } from './github.service';
import { LoginAttemptsService } from './login-attempts.service';

const GITHUB_STATE_COOKIE = 'frw_github_state';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Credentials {
  email?: string;
  password?: string;
}

function requireEmail(email: unknown): string {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(value) || value.length > 254)
    throw new BadRequestException('Enter a valid email address');
  return value;
}

function requirePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8)
    throw new BadRequestException('Password must be at least 8 characters');
  if (password.length > 200)
    throw new BadRequestException('Password is too long');
  return password;
}

@Controller('api/auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly emailTokens: EmailTokenService,
    private readonly email: EmailService,
    private readonly github: GithubAuthService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  @Get('config')
  config() {
    return { github: this.github.enabled };
  }

  @Post('signup')
  async signup(@Body() body: Credentials) {
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);
    const existing = await this.users.findByEmail(email);
    if (!existing) {
      const user = await this.users.create(email, password, false);
      await this.sendVerification(user.id, user.email);
    } else if (!existing.emailVerifiedAt) {
      await this.users.setPassword(existing.id, password);
      await this.sendVerification(existing.id, existing.email);
    }
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = token
      ? await this.emailTokens.consume(token, 'verify')
      : null;
    if (!userId)
      throw new BadRequestException('This link is invalid or has expired');
    await this.users.markVerified(userId);
    await this.sessions.start(res, userId);
    return { ok: true };
  }

  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body('email') rawEmail: string) {
    const user = await this.users.findByEmail(requireEmail(rawEmail));
    if (user && !user.emailVerifiedAt) {
      await this.sendVerification(user.id, user.email);
    }
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: Credentials,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = typeof body.email === 'string' ? body.email : '';
    const lockedMs = this.attempts.lockedForMs(email);
    if (lockedMs > 0) {
      throw new HttpException(
        `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedMs / 60_000)} minutes, or reset your password.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = email ? await this.users.findByEmail(email) : null;
    if (!user || !this.users.verifyPassword(user, body.password ?? '')) {
      this.attempts.recordFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }
    this.attempts.recordSuccess(email);
    if (!user.emailVerifiedAt)
      throw new ForbiddenException('email_not_verified');
    await this.sessions.start(res, user.id);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.end(req, res);
    return { ok: true };
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body('email') rawEmail: string) {
    const user = await this.users.findByEmail(requireEmail(rawEmail));
    if (user) {
      const token = await this.emailTokens.issue(user.id, 'reset');
      if (token) await this.email.sendPasswordReset(user.email, token);
    }
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() body: { token?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const password = requirePassword(body.password);
    const userId = body.token
      ? await this.emailTokens.consume(body.token, 'reset')
      : null;
    if (!userId)
      throw new BadRequestException('This link is invalid or has expired');
    await this.users.setPassword(userId, password);
    await this.users.markVerified(userId);
    const user = await this.users.findById(userId);
    if (user) this.attempts.recordSuccess(user.email);
    await this.sessions.endAllForUser(userId);
    await this.sessions.start(res, userId);
    return { ok: true };
  }

  @Get('github')
  githubStart(@Query('next') next: string, @Res() res: Response) {
    if (!this.github.enabled) throw new NotFoundException();
    const state = randomBytes(16).toString('base64url');
    setCookie(
      res,
      GITHUB_STATE_COOKIE,
      `${state}|${safeNext(next)}`,
      10 * 60_000,
      this.sessions.secureCookies,
    );
    res.redirect(this.github.authorizeUrl(state));
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const stored = readCookie(req, GITHUB_STATE_COOKIE) ?? '';
    clearCookie(res, GITHUB_STATE_COOKIE, this.sessions.secureCookies);
    const [expectedState, next] = stored.split('|');
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/login?error=github');
    }
    try {
      const { githubId, email } = await this.github.identify(code);
      let user = await this.users.findByGithubId(githubId);
      if (!user) {
        const byEmail = await this.users.findByEmail(email);
        if (byEmail) {
          await this.users.linkGithub(byEmail, githubId);
          user = byEmail;
        } else {
          user = await this.users.createFromGithub(email, githubId);
        }
      }
      await this.sessions.start(res, user.id);
      return res.redirect(safeNext(next));
    } catch (err) {
      this.logger.warn(`GitHub login failed: ${String(err)}`);
      return res.redirect('/login?error=github');
    }
  }

  private async sendVerification(userId: string, email: string) {
    const token = await this.emailTokens.issue(userId, 'verify');
    if (token) await this.email.sendVerification(email, token);
  }
}
