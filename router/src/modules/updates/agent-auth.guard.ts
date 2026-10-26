import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { EnrollmentService } from '../identity/enrollment.service';

// Guards agent-only HTTP endpoints (the binary download) with the long-lived
// agent JWT minted at enrollment. Reuses EnrollmentService.authenticateAgent,
// which also confirms the Agent row still exists (deleting it = revocation).
@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly enrollment: EnrollmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing agent token');
    }
    try {
      const { userId, agentId } = await this.enrollment.authenticateAgent(
        header.slice(7),
      );
      (req as Request & { agent?: unknown }).agent = { userId, agentId };
      return true;
    } catch {
      throw new UnauthorizedException('invalid or revoked agent token');
    }
  }
}
