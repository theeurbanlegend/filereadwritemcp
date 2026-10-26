import {
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { McpService } from './mcp.service';
import { WwwAuthenticateFilter } from 'src/common/filters/unauthorized.filter';
import type { McpUser } from 'src/common/strategies/jwt.strategy';

@Controller('mcp')
@SkipThrottle()
@UseGuards(AuthGuard(['jwt', 'apikey']))
@UseFilters(WwwAuthenticateFilter)
export class McpController {
  private transports = new Map<string, StreamableHTTPServerTransport>();
  constructor(private mcp: McpService) {}

  @Post()
  async post(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? this.transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(req.body)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32000, message: 'No valid session ID' },
        });
      }
      // The session is bound to the authenticated user; every tool call in this
      // session is forwarded to that user's connected agent.
      const userId = (req as Request & { user?: McpUser }).user?.userId;
      if (!userId) {
        return res.status(401).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32001, message: 'Unauthorized: no user identity' },
        });
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          this.transports.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) this.transports.delete(transport!.sessionId);
      };
      const server = this.mcp.createServer(userId);
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  async get(@Req() req: Request, @Res() res: Response) {
    const t = this.lookup(req, res);
    if (t) await t.handleRequest(req, res);
  }
  @Delete()
  async del(@Req() req: Request, @Res() res: Response) {
    const t = this.lookup(req, res);
    if (t) await t.handleRequest(req, res);
  }
  private lookup(req: Request, res: Response) {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    const t = sid ? this.transports.get(sid) : undefined;
    if (!t) {
      res.status(400).send('Invalid or missing session ID');
      return undefined;
    }
    return t;
  }
}
