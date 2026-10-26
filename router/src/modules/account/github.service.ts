import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

@Injectable()
export class GithubAuthService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<string>('GITHUB_OAUTH_CLIENT_ID') &&
      this.config.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
    );
  }

  private get callbackUrl(): string {
    return `${this.config.getOrThrow<string>('OAUTH_ISSUER')}/api/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('GITHUB_OAUTH_CLIENT_ID'),
    );
    u.searchParams.set('redirect_uri', this.callbackUrl);
    u.searchParams.set('scope', 'read:user user:email');
    u.searchParams.set('state', state);
    u.searchParams.set('allow_signup', 'true');
    return u.toString();
  }

  async identify(code: string): Promise<{ githubId: string; email: string }> {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.getOrThrow<string>('GITHUB_OAUTH_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>(
            'GITHUB_OAUTH_CLIENT_SECRET',
          ),
          code,
          redirect_uri: this.callbackUrl,
        }),
      },
    );
    const { access_token, error, error_description } =
      (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
    if (!access_token) {
      throw new UnauthorizedException(
        `GitHub token exchange failed: ${error_description ?? error ?? `HTTP ${tokenRes.status}`}`,
      );
    }

    const headers = {
      Authorization: `Bearer ${access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FileReadWrite',
    };
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);
    if (!userRes.ok || !emailsRes.ok) {
      throw new UnauthorizedException(
        `GitHub API request failed (user: HTTP ${userRes.status}, emails: HTTP ${emailsRes.status})`,
      );
    }
    const user = (await userRes.json()) as { id: number };
    const emails = (await emailsRes.json()) as GithubEmail[];
    const primary = emails.find((e) => e.primary && e.verified);
    if (!primary) {
      throw new UnauthorizedException(
        'Your GitHub account has no verified primary email',
      );
    }
    return { githubId: String(user.id), email: primary.email.toLowerCase() };
  }
}
