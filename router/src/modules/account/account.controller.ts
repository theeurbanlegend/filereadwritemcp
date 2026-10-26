import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from '../identity/users.service';
import { EnrollmentService } from '../identity/enrollment.service';
import { AgentRegistry } from '../routing/agent-registry';
import { OAuthService } from '../oauth/oauth.service';
import { OAuthClientService } from '../oauth/oauth-client.service';
import { SessionService } from '../session/session.service';
import { SessionGuard, type SessionRequest } from '../session/session.guard';

const UNKNOWN_CLIENT = 'unknown';

@Controller('api')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly enrollment: EnrollmentService,
    private readonly registry: AgentRegistry,
    private readonly oauth: OAuthService,
    private readonly clients: OAuthClientService,
    private readonly sessions: SessionService,
  ) {}

  @Get('me')
  async me(@Req() req: SessionRequest) {
    const user = await this.users.findById(req.sessionUserId!);
    if (!user) throw new NotFoundException();
    return {
      id: user.id,
      email: user.email,
      hasPassword: Boolean(user.passwordHash),
      githubLinked: Boolean(user.githubId),
      createdAt: user.createdAt,
    };
  }

  @Get('agents')
  async agents(@Req() req: SessionRequest) {
    const userId = req.sessionUserId!;
    const enrolled = await this.enrollment.listAgentsForUser(userId);
    const online = new Set(this.registry.list(userId).map((c) => c.agentId));
    return {
      agents: enrolled.map((a) => ({
        id: a.id,
        name: a.name,
        online: online.has(a.id),
        lastSeenAt: a.lastSeenAt,
        createdAt: a.createdAt,
      })),
      limit: this.enrollment.maxAgentsPerUser,
    };
  }

  @Patch('agents/:id')
  async renameAgent(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    if (typeof name !== 'string')
      throw new BadRequestException('Name is required');
    const agent = await this.enrollment.renameAgent(
      req.sessionUserId!,
      id,
      name,
    );
    return {
      agent: {
        id: agent.id,
        name: agent.name,
        lastSeenAt: agent.lastSeenAt,
        createdAt: agent.createdAt,
      },
    };
  }

  @Delete('agents/:id')
  @HttpCode(204)
  async revokeAgent(@Req() req: SessionRequest, @Param('id') id: string) {
    const userId = req.sessionUserId!;
    await this.enrollment.deleteAgent(userId, id);
    this.registry.get(userId, id)?.close(4001, 'revoked');
  }

  @Post('enrollment-codes')
  enrollmentCode(@Req() req: SessionRequest) {
    return this.enrollment.mintCode(req.sessionUserId!);
  }

  @Get('clients')
  async connectedClients(@Req() req: SessionRequest) {
    const rows = await this.oauth.activeClientsForUser(req.sessionUserId!);
    const clients = await Promise.all(
      rows.map(async (r) => {
        const client = r.clientId
          ? await this.clients.findById(r.clientId)
          : null;
        return {
          clientId: r.clientId ?? UNKNOWN_CLIENT,
          clientName: client?.clientName ?? 'Unknown client',
          lastUsedAt: r.lastUsedAt,
          expiresAt: r.expiresAt,
        };
      }),
    );
    return { clients };
  }

  @Delete('clients/:clientId')
  @HttpCode(204)
  async revokeClient(
    @Req() req: SessionRequest,
    @Param('clientId') clientId: string,
  ) {
    await this.oauth.revokeClientForUser(
      req.sessionUserId!,
      clientId === UNKNOWN_CLIENT ? null : clientId,
    );
  }

  @Delete('account')
  @HttpCode(204)
  async deleteAccount(
    @Req() req: SessionRequest,
    @Body('email') email: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.sessionUserId!;
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException();
    if (
      typeof email !== 'string' ||
      email.trim().toLowerCase() !== user.email
    ) {
      throw new BadRequestException('Type your account email to confirm');
    }
    for (const conn of this.registry.list(userId)) {
      conn.close(4001, 'account deleted');
    }
    await this.oauth.revokeAllForUser(userId);
    await this.sessions.end(req, res);
    await this.users.delete(userId);
  }
}
