import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOauthClient1783034964688 implements MigrationInterface {
  name = 'AddOauthClient1783034964688';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth_clients" ("id" uuid NOT NULL, "clientName" text, "redirectUris" jsonb NOT NULL, "secretHash" text, "grantTypes" jsonb NOT NULL, "tokenEndpointAuthMethod" text NOT NULL DEFAULT 'none', "scope" text NOT NULL DEFAULT 'mcp:tools', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c4759172d3431bae6f04e678e0d" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oauth_clients"`);
  }
}
