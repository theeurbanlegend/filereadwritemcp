import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

export type EmailTokenPurpose = 'verify' | 'reset';

@Entity({ name: 'email_tokens' })
export class EmailToken {
  @PrimaryColumn({ type: 'text' })
  tokenHash!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'text' })
  purpose!: EmailTokenPurpose;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
