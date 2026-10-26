import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli/cli.module';

// Admin CLI entrypoint. Build with `yarn build`, then run e.g.:
//   node dist/cli create-user --email you@example.com
async function bootstrap() {
  await CommandFactory.run(CliModule, ['warn', 'error']);
}

// Surface bootstrap failures (bad DATABASE_URL, DB down, etc.) with a clear
// message and a non-zero exit code instead of a silent success.
bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
