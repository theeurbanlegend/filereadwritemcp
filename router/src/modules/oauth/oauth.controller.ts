import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OAuthService } from './oauth.service';
import {
  type ClientRegistration,
  OAuthClientService,
} from './oauth-client.service';
import type { OAuthClient } from '../../database/entities/oauthclient.entity';
import { SessionService } from '../session/session.service';
import { SessionGuard, type SessionRequest } from '../session/session.guard';

interface AuthorizeQuery {
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  response_type?: string;
}
interface ConsentBody extends AuthorizeQuery {
  approve?: boolean;
}
interface OAuthBodyRequest {
  grant_type?: 'authorization_code' | 'refresh_token';
  redirect_uri?: string;
  code_verifier?: string;
  code?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
}

@Controller()
export class OAuthController {
  constructor(
    private oauth: OAuthService,
    private config: ConfigService,
    private clients: OAuthClientService,
    private sessions: SessionService,
  ) {}

  private get issuer() {
    return this.config.getOrThrow<string>('OAUTH_ISSUER');
  }
  private get resource() {
    return this.config.getOrThrow<string>('MCP_RESOURCE_URL');
  }

  @Get('.well-known/oauth-authorization-server') // RFC 8414
  asMetadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      registration_endpoint: `${this.issuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ],
      scopes_supported: ['mcp:tools'],
    };
  }

  @Get('.well-known/oauth-protected-resource') // RFC 9728
  prMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.issuer],
      scopes_supported: ['mcp:tools'],
      bearer_methods_supported: ['header'],
    };
  }

  // RFC 7591 Dynamic Client Registration (open registration).
  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(@Body() body: ClientRegistration) {
    const { client, plainSecret } = await this.clients.register(body ?? {});
    return {
      client_id: client.id,
      ...(plainSecret
        ? { client_secret: plainSecret, client_secret_expires_at: 0 }
        : {}),
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: client.scope,
      ...(client.clientName ? { client_name: client.clientName } : {}),
    };
  }

  @Get('authorize')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async authorize(
    @Req() req: Request,
    @Res() res: Response,
    @Query() q: AuthorizeQuery,
  ) {
    const client = await this.loadClient(res, q);
    if (!client) return;
    if (!this.validPkceRequest(q)) {
      return res.redirect(this.errorUrl(q, 'invalid_request'));
    }
    const query = req.originalUrl.slice(req.originalUrl.indexOf('?'));
    const userId = await this.sessions.userIdFor(req);
    if (!userId) {
      return res.redirect(
        `/login?next=${encodeURIComponent(`/authorize${query}`)}`,
      );
    }
    return res.redirect(`/consent${query}`);
  }

  @Get('api/oauth/client')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  async clientInfo(@Query('client_id') clientId: string) {
    const client = clientId ? await this.clients.findById(clientId) : null;
    if (!client) throw new BadRequestException('Unknown client');
    return { clientName: client.clientName ?? 'An MCP client' };
  }

  @Post('api/oauth/authorize')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async consent(@Req() req: SessionRequest, @Body() body: ConsentBody) {
    const client = body.client_id
      ? await this.clients.findById(body.client_id)
      : null;
    if (!client) throw new BadRequestException('Unknown client');
    if (!body.redirect_uri || !client.redirectUris.includes(body.redirect_uri))
      throw new BadRequestException('Invalid redirect_uri');
    if (!this.validPkceRequest(body)) {
      return { redirectUrl: this.errorUrl(body, 'invalid_request') };
    }
    if (body.approve !== true) {
      return { redirectUrl: this.errorUrl(body, 'access_denied') };
    }

    const code = this.oauth.issueCode(
      body.redirect_uri,
      body.code_challenge!,
      body.scope ?? 'mcp:tools',
      req.sessionUserId!,
      client.id,
    );
    const out = new URL(body.redirect_uri);
    out.searchParams.set('code', code);
    if (body.state) out.searchParams.set('state', body.state);
    return { redirectUrl: out.toString() };
  }

  @Post('token')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async token(
    @Body() body: OAuthBodyRequest,
    @Headers('authorization') auth: string,
    @Res() res: Response,
  ) {
    const creds = this.extractClientCreds(auth, body);
    if (!creds.id) return res.status(401).json({ error: 'invalid_client' });
    const client = await this.clients.findById(creds.id);
    if (!client) return res.status(401).json({ error: 'invalid_client' });
    if (!this.clients.verifySecret(client, creds.secret))
      return res.status(401).json({ error: 'invalid_client' });

    if (body.grant_type === 'authorization_code') {
      const rec = this.oauth.consumeCode(body.code!);
      if (
        !rec ||
        rec.clientId !== client.id ||
        rec.redirectUri !== body.redirect_uri
      )
        return res.status(400).json({ error: 'invalid_grant' });
      if (!this.oauth.verifyPkce(body.code_verifier ?? '', rec.challenge))
        return res.status(400).json({ error: 'invalid_grant' });
      return res.json(await this.tokens(rec.scope, rec.userId, client.id));
    }
    if (body.grant_type === 'refresh_token') {
      const rec = await this.oauth.consumeRefresh(body.refresh_token!);
      if (!rec || (rec.clientId !== null && rec.clientId !== client.id))
        return res.status(400).json({ error: 'invalid_grant' });
      return res.json(await this.tokens(rec.scope, rec.userId, client.id));
    }
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  private async tokens(scope: string, userId: string, clientId: string) {
    const { token, expiresIn } = this.oauth.signAccessToken(scope, userId);
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: await this.oauth.issueRefresh(scope, userId, clientId),
      scope,
    };
  }

  private validPkceRequest(q: AuthorizeQuery): boolean {
    return (
      q.response_type === 'code' &&
      q.code_challenge_method === 'S256' &&
      Boolean(q.code_challenge)
    );
  }

  private async loadClient(
    res: Response,
    q: AuthorizeQuery,
  ): Promise<OAuthClient | null> {
    const client = q.client_id
      ? await this.clients.findById(q.client_id)
      : null;
    if (!client) {
      res.status(400).send('invalid_client');
      return null;
    }
    if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) {
      res.status(400).send('invalid redirect_uri');
      return null;
    }
    return client;
  }

  private errorUrl(q: AuthorizeQuery, error: string): string {
    const u = new URL(q.redirect_uri);
    u.searchParams.set('error', error);
    if (q.state) u.searchParams.set('state', q.state);
    return u.toString();
  }

  private extractClientCreds(
    auth: string | undefined,
    body: { client_id?: string; client_secret?: string },
  ): { id?: string; secret?: string } {
    if (auth?.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      return {
        id: decodeURIComponent(decoded.slice(0, i)),
        secret: decodeURIComponent(decoded.slice(i + 1)),
      };
    }
    return { id: body.client_id, secret: body.client_secret };
  }
}
