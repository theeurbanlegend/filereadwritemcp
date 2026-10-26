import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';

export interface GithubAsset {
  id: number;
  name: string;
  url: string;
  browser_download_url: string;
}

export interface GithubRelease {
  tag_name: string;
  assets?: GithubAsset[];
  draft?: boolean;
  prerelease?: boolean;
}

interface CachedRelease {
  version: string;
  dir: string;
  shaByTarget: Record<string, string>;
}

function stripV(tag: string): string {
  return tag.replace(/^v/, '');
}

function parseVer(v: string): number[] {
  return stripV(v)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

// True when `latest` is a strictly greater X.Y.Z than `current`.
function isNewer(latest: string, current: string): boolean {
  const a = parseVer(latest);
  const b = parseVer(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Caches the latest GitHub release's agent-<target> binaries on disk and answers
// two questions: "should this agent update?" and "give me the binary for <target>".
// The router is the ONLY thing that talks to GitHub, so agents (and the fleet's
// shared NAT IP) never hit the GitHub API.
@Injectable()
export class UpdatesService implements OnModuleInit {
  private readonly logger = new Logger(UpdatesService.name);
  private latest: CachedRelease | null = null;

  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly secret: string;
  private readonly dir: string;

  constructor(private readonly config: ConfigService) {
    this.owner = config.get<string>('GITHUB_OWNER', 'theeurbanlegend');
    this.repo = config.get<string>('GITHUB_REPO', 'filereadwritemcp');
    this.token = config.get<string>('GITHUB_TOKEN', '');
    this.secret = config.get<string>('GITHUB_WEBHOOK_SECRET', '');
    this.dir = config.get<string>('RELEASES_DIR', '/data/releases');
  }

  async onModuleInit(): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await this.refreshFromLatest();
    } catch (err) {
      this.logger.warn(`Startup release refresh skipped: ${this.msg(err)}`);
    }
  }

  // ---- GitHub webhook HMAC (X-Hub-Signature-256) ----
  verifySignature(raw: Buffer, signature?: string): boolean {
    if (!this.secret || !signature) return false;
    const expected =
      'sha256=' + createHmac('sha256', this.secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ---- what to offer a connecting / polling agent ----
  updateOfferFor(
    agentVersion?: string,
    target?: string,
  ): { version: string; sha256: string } | null {
    if (!this.latest || !agentVersion || !target) return null;
    const sha256 = this.latest.shaByTarget[target];
    if (!sha256) return null;
    if (!isNewer(this.latest.version, agentVersion)) return null;
    return { version: this.latest.version, sha256 };
  }

  getBinaryPath(target?: string): string | null {
    if (!this.latest || !target) return null;
    if (!this.latest.shaByTarget[target]) return null;
    const p = path.join(this.latest.dir, `agent-${target}`);
    return existsSync(p) ? p : null;
  }

  fileSize(file: string): number {
    try {
      return statSync(file).size;
    } catch {
      return 0;
    }
  }

  // ---- ingestion ----
  async refreshFromLatest(): Promise<void> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`;
    const { data } = await axios.get<GithubRelease>(url, {
      headers: this.ghHeaders(),
    });
    await this.ingestRelease(data);
  }

  async ingestRelease(release: GithubRelease): Promise<void> {
    if (!release?.tag_name) {
      this.logger.warn('Release payload missing tag_name; ignoring');
      return;
    }
    const tag = release.tag_name;
    const version = stripV(tag);
    const targetDir = path.join(this.dir, tag);
    await fs.mkdir(targetDir, { recursive: true });

    const shaByTarget: Record<string, string> = {};
    for (const asset of release.assets ?? []) {
      if (!asset.name.startsWith('agent-')) continue; // skip SHA256SUMS etc.
      const target = asset.name.slice('agent-'.length);
      const bytes = await this.downloadAsset(asset);
      const dest = path.join(targetDir, asset.name);
      await fs.writeFile(dest, bytes);
      await fs.chmod(dest, 0o755);
      shaByTarget[target] = createHash('sha256').update(bytes).digest('hex');
    }

    if (Object.keys(shaByTarget).length === 0) {
      this.logger.warn(`Release ${tag} had no agent-* assets; nothing cached`);
      return;
    }

    this.latest = { version, dir: targetDir, shaByTarget };
    await this.pruneExcept(tag);
    this.logger.log(
      `Cached release ${tag} (${Object.keys(shaByTarget).length} target(s): ${Object.keys(shaByTarget).join(', ')})`,
    );
  }

  // Private-repo asset download: hit the asset API url with octet-stream + auth,
  // then follow the redirect to storage WITHOUT the GitHub auth header (storage
  // rejects a second auth mechanism).
  private async downloadAsset(asset: GithubAsset): Promise<Buffer> {
    const first = await axios.get<ArrayBuffer>(asset.url, {
      headers: { ...this.ghHeaders(), Accept: 'application/octet-stream' },
      responseType: 'arraybuffer',
      maxRedirects: 0,
      validateStatus: (s) => s === 200 || s === 302,
    });
    if (first.status === 200) return Buffer.from(first.data);
    const location = first.headers['location'] as string;
    const second = await axios.get<ArrayBuffer>(location, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(second.data);
  }

  // Keep only the newest release on disk (a couple MB each, but no reason to hoard).
  private async pruneExcept(keepTag: string): Promise<void> {
    const entries = await fs
      .readdir(this.dir, { withFileTypes: true })
      .catch(() => []);
    for (const e of entries) {
      if (e.isDirectory() && e.name !== keepTag) {
        await fs.rm(path.join(this.dir, e.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  private ghHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'filereadwrite-router',
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
