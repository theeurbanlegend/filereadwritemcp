import { Command, CommandRunner, Option } from 'nest-commander';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../modules/identity/users.service';

interface CreateUserOptions {
  email?: string;
  password?: string;
}

@Command({
  name: 'create-user',
  description: 'Create a new user (admin only).',
})
export class CreateUserCommand extends CommandRunner {
  constructor(private readonly users: UsersService) {
    super();
  }

  async run(_params: string[], options: CreateUserOptions = {}): Promise<void> {
    try {
      const email = options.email?.trim().toLowerCase();
      if (!email) {
        console.error(
          'Missing --email. Usage: create-user --email you@example.com [--password <pw>]',
        );
        process.exitCode = 1;
        return;
      }

      const existing = await this.users.findByEmail(email);
      if (existing) {
        console.error(`User already exists: ${email}`);
        process.exitCode = 1;
        return;
      }

      const generated = !options.password;
      const password =
        options.password ?? randomBytes(12).toString('base64url');

      const user = await this.users.create(email, password);
      console.log(`Created user ${user.email} (id: ${user.id})`);
      if (generated) {
        console.log(`Generated password: ${password}`);
        console.log('Store it now — it will not be shown again.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to create user: ${message}`);
      if (/relation .* does not exist|no such table/i.test(message)) {
        console.error(
          'The database schema is missing. Set DB_SYNC=true in .env (dev) and retry, or run: yarn migration:run',
        );
      }
      process.exitCode = 1;
    }
  }

  @Option({ flags: '-e, --email <email>', description: 'User email' })
  parseEmail(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --password <password>',
    description: 'Password (a strong one is generated if omitted)',
  })
  parsePassword(val: string): string {
    return val;
  }
}
