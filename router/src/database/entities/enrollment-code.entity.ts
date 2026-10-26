import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

// A short-lived code the user redeems on their PC to enroll an agent to their account.
@Entity({ name: 'enrollment_codes' })
export class EnrollmentCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // sha256 of the short code shown to the user; never store the raw code.
  @Index({ unique: true })
  @Column({ type: 'text' })
  codeHash!: string;

  @Index()
  @Column()
  userId!: string;

  @ManyToOne(() => User, (user) => user.enrollmentCodes, {
    onDelete: 'CASCADE',
  })
  user!: User;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
