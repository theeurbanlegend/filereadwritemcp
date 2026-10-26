import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EnrollmentService } from './enrollment.service';

interface EnrollBody {
  code?: string;
  name?: string;
}

// Public endpoint: a device redeems a one-time enrollment code for an agent
// token. The code itself is the credential, so no auth guard is applied.
@Controller('agent')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post('enroll')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  async enroll(
    @Body() body: EnrollBody,
  ): Promise<{ token: string; agentId: string }> {
    if (!body?.code) throw new BadRequestException('Missing enrollment code');
    return this.enrollment.redeem(body.code, body.name ?? '');
  }
}
