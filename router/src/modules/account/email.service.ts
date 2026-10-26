import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.getOrThrow<string>('OAUTH_ISSUER');
  }

  sendVerification(to: string, token: string): Promise<void> {
    const link = `${this.baseUrl}/verify-email?token=${token}`;
    return this.send(
      to,
      'Verify your FileReadWrite email',
      `Confirm your email to finish creating your FileReadWrite account:\n\n${link}\n\nThe link expires in 24 hours. If you didn't sign up, ignore this email.`,
    );
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.baseUrl}/reset-password?token=${token}`;
    return this.send(
      to,
      'Reset your FileReadWrite password',
      `Someone asked to reset the password for your FileReadWrite account:\n\n${link}\n\nThe link expires in 1 hour. If it wasn't you, ignore this email; your password stays the same.`,
    );
  }

  private async send(to: string, subject: string, text: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not set; email to ${to} not sent:\n${text}`,
      );
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.getOrThrow<string>('EMAIL_FROM'),
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      this.logger.error(
        `Resend rejected email to ${to}: ${res.status} ${await res.text()}`,
      );
    }
  }
}
