import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

// A persisted OAuth refresh token. Survives router restarts (unlike the old
// in-memory Map), so clients don't get forced to re-login on every redeploy.
// Only the sha256 hash of the token is stored; the raw value is shown to the
// client once. Rotation = the row is deleted when the token is consumed.
@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryColumn({ type: 'text' })
  tokenHash!: string;

  @Index()
  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'text' })
  scope!: string;

  @Column({ type: 'uuid', nullable: true })
  clientId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
