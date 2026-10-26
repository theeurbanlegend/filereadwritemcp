import { Command, CommandRunner, Option } from 'nest-commander';
import { UsersService } from '../modules/identity/users.service';
import { EnrollmentService } from '../modules/identity/enrollment.service';

interface CreateEnrollmentOptions {
  email?: string;
}

@Command({
  name: 'create-enrollment',
  description: 'Mint a one-time enrollment code for a user (admin only).',
})
export class CreateEnrollmentCommand extends CommandRunner {
  constructor(
    private readonly users: UsersService,
    private readonly enrollment: EnrollmentService,
  ) {
    super();
  }

  async run(
    _params: string[],
    options: CreateEnrollmentOptions = {},
  ): Promise<void> {
    try {
      const email = options.email?.trim().toLowerCase();
      if (!email) {
        console.error(
          'Missing --email. Usage: create-enrollment --email you@example.com',
        );
        process.exitCode = 1;
        return;
      }
      const user = await this.users.findByEmail(email);
      if (!user) {
        console.error(
          `No user found for ${email}. Create one first with create-user.`,
        );
        process.exitCode = 1;
        return;
      }
      const { code, expiresAt } = await this.enrollment.mintCode(user.id);
      console.log(`Enrollment code for ${email}:`);
      console.log('');
      console.log(`    ${code}`);
      console.log('');
      console.log(
        `Expires ${expiresAt.toISOString()} (15 minutes, one-time use).`,
      );
      console.log(
        'On the device, redeem it at POST /agent/enroll (the agent CLI comes next).',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to mint enrollment code: ${message}`);
      if (/relation .* does not exist|no such table/i.test(message)) {
        console.error(
          'The database schema is missing. Run: yarn migration:run (or set DB_SYNC=true in dev).',
        );
      }
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '-e, --email <email>',
    description: 'User to enroll a device for',
  })
  parseEmail(val: string): string {
    return val;
  }
}
