import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1783027811941 implements MigrationInterface {
  name = 'InitialMigration1783027811941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "enrollment_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codeHash" text NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1cb09f5a923989689352cd109a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7859c85c9ce06e5848a509090b" ON "enrollment_codes"  ("codeHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1f33294ae0cd7cadf9ce7673b0" ON "enrollment_codes"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "tokenHash" text NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f535e5b2c0f0dc7b7fc656ebc9" ON "agents"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_codes" ADD CONSTRAINT "FK_1f33294ae0cd7cadf9ce7673b01" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" ADD CONSTRAINT "FK_f535e5b2c0f0dc7b7fc656ebc91" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agents" DROP CONSTRAINT "FK_f535e5b2c0f0dc7b7fc656ebc91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_codes" DROP CONSTRAINT "FK_1f33294ae0cd7cadf9ce7673b01"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f535e5b2c0f0dc7b7fc656ebc9"`,
    );
    await queryRunner.query(`DROP TABLE "agents"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1f33294ae0cd7cadf9ce7673b0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7859c85c9ce06e5848a509090b"`,
    );
    await queryRunner.query(`DROP TABLE "enrollment_codes"`);
  }
}
