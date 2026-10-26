import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'oauth_clients' })
export class OAuthClient {
  @PrimaryColumn('uuid')
  id!: string; // the issued client_id

  @Column({ type: 'text', nullable: true })
  clientName!: string | null;

  @Column({ type: 'jsonb' })
  redirectUris!: string[];

  // sha256 of the client_secret for confidential clients; null for public.
  @Column({ type: 'text', nullable: true })
  secretHash!: string | null;

  @Column({ type: 'jsonb' })
  grantTypes!: string[];

  @Column({ type: 'text', default: 'none' })
  tokenEndpointAuthMethod!: string;

  @Column({ type: 'text', default: 'mcp:tools' })
  scope!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
