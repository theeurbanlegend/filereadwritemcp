import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Agent } from '../../database/entities/agent.entity';
import { EnrollmentCode } from '../../database/entities/enrollment-code.entity';

const CODE_TTL_MS = 15 * 60_000; // 15 minutes

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(EnrollmentCode)
    private readonly codes: Repository<EnrollmentCode>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Admin: mint a one-time, short-lived enrollment code for a user.
  // Returns the RAW code (shown once); only its hash is persisted.
  get maxAgentsPerUser(): number {
    return Number(this.config.get('MAX_AGENTS_PER_USER') ?? 10);
  }

  async mintCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
    await this.assertUnderLimit(userId);
    const code = randomBytes(15).toString('base64url');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.codes.save(
      this.codes.create({ codeHash: sha256(code), userId, expiresAt }),
    );
    return { code, expiresAt };
  }

  // Agent: redeem a code -> create an Agent row and return a JWT agent token.
  async redeem(
    rawCode: string,
    deviceName: string,
  ): Promise<{ token: string; agentId: string }> {
    const rec = await this.codes.findOne({
      where: { codeHash: sha256(rawCode) },
    });
    if (!rec || rec.consumedAt || rec.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired enrollment code');
    }
    await this.assertUnderLimit(rec.userId);
    // Atomically claim the code so it cannot be redeemed twice (race-safe).
    const claim = await this.codes.update(
      { id: rec.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (claim.affected !== 1) {
      throw new BadRequestException('Enrollment code already used');
    }

    const agentId = randomUUID();
    const token = this.signAgentToken(rec.userId, agentId);
    await this.agents.save(
      this.agents.create({
        id: agentId,
        userId: rec.userId,
        name: deviceName.trim() || 'Unnamed device',
        tokenHash: sha256(token),
      }),
    );
    return { token, agentId };
  }

  // Gateway: authenticate a connecting agent. Verifies the token, confirms the
  // Agent row still exists (deleting it = revocation), and touches lastSeenAt.
  async authenticateAgent(
    token: string,
  ): Promise<{ userId: string; agentId: string; name: string }> {
    const { userId, agentId } = this.verifyAgentToken(token);
    const agent = await this.agents.findOne({ where: { id: agentId, userId } });
    if (!agent) throw new BadRequestException('Unknown or revoked agent');
    await this.agents.update({ id: agentId }, { lastSeenAt: new Date() });
    return { userId, agentId, name: agent.name };
  }

  // List a user's enrolled machines (newest first). Used by the getAgents MCP
  // tool and dashboard views.
  async listAgentsForUser(userId: string): Promise<Agent[]> {
    return this.agents.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async renameAgent(userId: string, agentId: string, name: string) {
    const agent = await this.agents.findOne({ where: { id: agentId, userId } });
    if (!agent) throw new NotFoundException('Machine not found');
    const trimmed = name.trim().slice(0, 100);
    if (!trimmed) throw new BadRequestException('Name is required');
    agent.name = trimmed;
    return this.agents.save(agent);
  }

  async deleteAgent(userId: string, agentId: string): Promise<void> {
    const res = await this.agents.delete({ id: agentId, userId });
    if (!res.affected) throw new NotFoundException('Machine not found');
  }

  private async assertUnderLimit(userId: string): Promise<void> {
    const count = await this.agents.count({ where: { userId } });
    if (count >= this.maxAgentsPerUser) {
      throw new BadRequestException(
        `You've reached the limit of ${this.maxAgentsPerUser} machines. Remove one first.`,
      );
    }
  }

  // Verify an agent token (used by authenticateAgent).
  verifyAgentToken(token: string): { userId: string; agentId: string } {
    const payload = this.jwt.verify<{
      sub?: string;
      agentId?: string;
      typ?: string;
    }>(token, { issuer: this.config.getOrThrow('OAUTH_ISSUER') });
    if (payload.typ !== 'agent' || !payload.sub || !payload.agentId) {
      throw new BadRequestException('Not a valid agent token');
    }
    return { userId: payload.sub, agentId: payload.agentId };
  }

  private signAgentToken(userId: string, agentId: string): string {
    // Long-lived daemon credential (no expiry); revoke by deleting the Agent row.
    return this.jwt.sign(
      { sub: userId, agentId, typ: 'agent' },
      { issuer: this.config.getOrThrow('OAUTH_ISSUER') },
    );
  }
}
