import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccounts1792085169337 implements MigrationInterface {
  name = 'AddAccounts1792085169337';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sessions" ("tokenHash" text NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bace6c68efc156fddac9b14bda2" PRIMARY KEY ("tokenHash"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "sessions"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_tokens" ("tokenHash" text NOT NULL, "userId" uuid NOT NULL, "purpose" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c9d0517a29ae032a37e258d517" PRIMARY KEY ("tokenHash"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a5e6c81093655b770eabd0460" ON "email_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerifiedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "emailVerifiedAt" = "createdAt"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "githubId" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_42148de213279d66bf94b363bf2" UNIQUE ("githubId")`,
    );
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "clientId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_tokens" ADD CONSTRAINT "FK_0a5e6c81093655b770eabd04600" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_tokens" DROP CONSTRAINT "FK_0a5e6c81093655b770eabd04600"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "clientId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_42148de213279d66bf94b363bf2"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "githubId"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerifiedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0a5e6c81093655b770eabd0460"`,
    );
    await queryRunner.query(`DROP TABLE "email_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_57de40bc620f456c7311aa3a1e"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
