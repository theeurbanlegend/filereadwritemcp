import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Agent } from './entities/agent.entity';
import { EnrollmentCode } from './entities/enrollment-code.entity';
import { OAuthClient } from './entities/oauthclient.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from './entities/session.entity';
import { EmailToken } from './entities/email-token.entity';

// Shared by the TypeORM migration CLI and by DatabaseModule (via dataSource.options).
// Entities are explicit class refs (not a glob) so the SAME class objects load
// under both ts-node (yarn cli / dev) and compiled dist (prod / migrations) —
// a glob of *.entity.js resolves to nothing (or a duplicate class) under ts-node.
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://mcp:mcp@localhost:5432/mcp',
  synchronize: process.env.DB_SYNC === 'true',
  entities: [
    User,
    Agent,
    EnrollmentCode,
    OAuthClient,
    RefreshToken,
    Session,
    EmailToken,
  ],
  migrations: ['dist/database/migrations/*.js'],
  migrationsTableName: 'migrations',
});
