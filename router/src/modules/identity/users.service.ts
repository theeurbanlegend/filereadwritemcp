import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { User } from '../../database/entities/user.entity';

const SCRYPT_KEYLEN = 64;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findByGithubId(githubId: string): Promise<User | null> {
    return this.users.findOne({ where: { githubId } });
  }

  async create(
    email: string,
    password: string,
    verified = true,
  ): Promise<User> {
    const user = this.users.create({
      email: email.trim().toLowerCase(),
      passwordHash: this.hashPassword(password),
      emailVerifiedAt: verified ? new Date() : null,
    });
    return this.users.save(user);
  }

  async createFromGithub(email: string, githubId: string): Promise<User> {
    return this.users.save(
      this.users.create({
        email: email.trim().toLowerCase(),
        passwordHash: null,
        githubId,
        emailVerifiedAt: new Date(),
      }),
    );
  }

  async setPassword(userId: string, password: string): Promise<void> {
    await this.users.update(
      { id: userId },
      { passwordHash: this.hashPassword(password) },
    );
  }

  async markVerified(userId: string): Promise<void> {
    await this.users.update({ id: userId }, { emailVerifiedAt: new Date() });
  }

  async linkGithub(user: User, githubId: string): Promise<void> {
    await this.users.update(
      { id: user.id },
      {
        githubId,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        passwordHash: user.emailVerifiedAt ? user.passwordHash : null,
      },
    );
  }

  async delete(userId: string): Promise<void> {
    await this.users.delete({ id: userId });
  }

  // Constant-time verification of a plaintext password against the stored hash.
  verifyPassword(user: User, password: string): boolean {
    if (!user.passwordHash) return false;
    const [saltHex, keyHex] = user.passwordHash.split(':');
    if (!saltHex || !keyHex) return false;
    const key = Buffer.from(keyHex, 'hex');
    const derived = scryptSync(
      password,
      Buffer.from(saltHex, 'hex'),
      key.length,
    );
    return key.length === derived.length && timingSafeEqual(key, derived);
  }

  // scrypt (memory-hard) with a per-user random salt. Stored as "saltHex:keyHex".
  private hashPassword(password: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, SCRYPT_KEYLEN);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
  }
}
