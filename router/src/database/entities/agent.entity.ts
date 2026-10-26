import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

// An enrolled machine (a user's PC) that dials into the router over WebSocket.
@Entity({ name: 'agents' })
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @ManyToOne(() => User, (user) => user.agents, { onDelete: 'CASCADE' })
  user!: User;

  // Human-friendly label for the machine, e.g. "Work MacBook".
  @Column()
  name!: string;

  // sha256 of the long-lived agent token; the raw token is shown to the agent once.
  @Column({ type: 'text' })
  tokenHash!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
