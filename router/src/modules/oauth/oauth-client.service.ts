import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { OAuthClient } from '../../database/entities/oauthclient.entity';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const ALLOWED_GRANTS = ['authorization_code', 'refresh_token'];
const BLOCKED_SCHEMES = new Set([
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'about:',
  'ftp:',
  'ws:',
  'wss:',
]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validRedirectUri(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > MAX_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (BLOCKED_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = Array.from(raw)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name || null;
}

export interface ClientRegistration {
  redirect_uris?: unknown[];
  client_name?: string;
  grant_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

@Injectable()
export class OAuthClientService {
  constructor(
    @InjectRepository(OAuthClient)
    private readonly clients: Repository<OAuthClient>,
  ) {}

  async register(
    meta: ClientRegistration,
  ): Promise<{ client: OAuthClient; plainSecret?: string }> {
    const redirectUris = Array.isArray(meta.redirect_uris)
      ? meta.redirect_uris
      : [];
    if (redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris is required');
    }
    if (redirectUris.length > MAX_REDIRECT_URIS) {
      throw new BadRequestException('Too many redirect_uris');
    }
    if (!redirectUris.every(validRedirectUri)) {
      throw new BadRequestException(
        'redirect_uris must be https, http on localhost, or an app-specific scheme, without fragments',
      );
    }
    const grantTypes = Array.isArray(meta.grant_types)
      ? meta.grant_types.filter((g) => ALLOWED_GRANTS.includes(g))
      : [];
    const requested = meta.token_endpoint_auth_method;
    const authMethod =
      requested === 'client_secret_basic' || requested === 'client_secret_post'
        ? requested
        : 'none';

    let plainSecret: string | undefined;
    let secretHash: string | null = null;
    if (authMethod !== 'none') {
      plainSecret = randomBytes(32).toString('base64url');
      secretHash = sha256(plainSecret);
    }

    const client = this.clients.create({
      id: randomUUID(),
      clientName: cleanName(meta.client_name),
      redirectUris: redirectUris as string[],
      secretHash,
      grantTypes: grantTypes.length ? grantTypes : ALLOWED_GRANTS,
      tokenEndpointAuthMethod: authMethod,
      scope: 'mcp:tools',
    });
    await this.clients.save(client);
    return { client, plainSecret };
  }

  async findById(clientId: string): Promise<OAuthClient | null> {
    // client_id lands in a uuid column; a non-UUID value (e.g. a stale
    // pre-DCR client_id like "hyperagent-local") would make Postgres throw
    // "invalid input syntax for type uuid". Reject it cleanly instead.
    if (!isUUID(clientId)) return null;
    return this.clients.findOne({ where: { id: clientId } });
  }

  // Public clients (no secret) authenticate via PKCE only.
  verifySecret(client: OAuthClient, presented: string | undefined): boolean {
    if (!client.secretHash) return true;
    if (!presented) return false;
    const a = Buffer.from(sha256(presented));
    const b = Buffer.from(client.secretHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
