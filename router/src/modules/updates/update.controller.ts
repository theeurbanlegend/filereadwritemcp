import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Headers,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { UpdatesService, GithubRelease } from './updates.service';
import { AgentAuthGuard } from './agent-auth.guard';

@Controller('agent/update')
export class UpdateController {
  private readonly logger = new Logger(UpdateController.name);

  constructor(private readonly updates: UpdatesService) {}

  // GitHub release webhook. The body is a raw Buffer (see the scoped raw parser
  // in main.ts) so the HMAC signature can be verified over exact bytes.
  @Post('webhook')
  handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
  ): void {
    const raw = req.body as Buffer;
    if (
      !Buffer.isBuffer(raw) ||
      !this.updates.verifySignature(raw, signature)
    ) {
      res.status(401).send('invalid signature');
      return;
    }
    if (event === 'ping') {
      res.status(200).send('pong');
      return;
    }
    if (event !== 'release') {
      res.status(202).send('ignored event');
      return;
    }

    const payload = JSON.parse(raw.toString('utf8')) as {
      action?: string;
      release?: GithubRelease;
    };
    if (
      !payload.action ||
      !['published', 'released'].includes(payload.action)
    ) {
      res.status(202).send('ignored action');
      return;
    }
    if (!payload.release) {
      res.status(202).send('no release in payload');
      return;
    }

    // Ingest asynchronously — GitHub just needs a fast ack.
    void this.updates
      .ingestRelease(payload.release)
      .catch((err) => this.logger.error(`Ingest failed: ${err}`));
    res.status(202).send('accepted');
  }

  // Authenticated binary download for enrolled agents.
  @UseGuards(AgentAuthGuard)
  @Get('download')
  download(@Query('target') target: string, @Res() res: Response): void {
    const file = this.updates.getBinaryPath(target);
    if (!file) throw new NotFoundException('no binary cached for target');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="agent-${target}"`,
    );
    const size = this.updates.fileSize(file);
    if (size) res.setHeader('Content-Length', String(size));
    createReadStream(file).pipe(res);
  }
}
