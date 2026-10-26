import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from './session.service';

export type SessionRequest = Request & { sessionUserId?: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const userId = await this.sessions.userIdFor(req);
    if (!userId) throw new UnauthorizedException();
    req.sessionUserId = userId;
    return true;
  }
}
