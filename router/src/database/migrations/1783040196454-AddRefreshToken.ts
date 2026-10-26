import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshToken1783040196454 implements MigrationInterface {
  name = 'AddRefreshToken1783040196454';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("tokenHash" text NOT NULL, "userId" text NOT NULL, "scope" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c25bc63d248ca90e8dcc1d92d06" PRIMARY KEY ("tokenHash"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens"  ("userId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
