import { Injectable, OnModuleDestroy } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_TRACKED = 50_000;

interface Attempts {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

@Injectable()
export class LoginAttemptsService implements OnModuleDestroy {
  private readonly attempts = new Map<string, Attempts>();
  private readonly sweeper = setInterval(() => this.sweep(), 60_000).unref();

  lockedForMs(email: string): number {
    const rec = this.attempts.get(this.key(email));
    if (!rec) return 0;
    return Math.max(0, rec.lockedUntil - Date.now());
  }

  recordFailure(email: string): void {
    const key = this.key(email);
    const now = Date.now();
    let rec = this.attempts.get(key);
    if (!rec || now - rec.firstFailureAt > WINDOW_MS) {
      if (this.attempts.size >= MAX_TRACKED) this.sweep();
      rec = { failures: 0, firstFailureAt: now, lockedUntil: 0 };
      this.attempts.set(key, rec);
    }
    rec.failures += 1;
    if (rec.failures >= MAX_FAILURES) {
      rec.lockedUntil = now + LOCK_MS;
      rec.failures = 0;
      rec.firstFailureAt = now;
    }
  }

  recordSuccess(email: string): void {
    this.attempts.delete(this.key(email));
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, rec] of this.attempts) {
      if (rec.lockedUntil < now && now - rec.firstFailureAt > WINDOW_MS) {
        this.attempts.delete(key);
      }
    }
  }
}
