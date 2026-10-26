import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Agent } from '../../database/entities/agent.entity';
import { EnrollmentCode } from '../../database/entities/enrollment-code.entity';
import { UsersService } from './users.service';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { jwtSecret } from '../../common/secrets';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Agent, EnrollmentCode]),
    // Self-contained JwtModule so EnrollmentService can sign/verify agent tokens
    // in any context (HTTP app AND the nest-commander CLI).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: jwtSecret(c),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [EnrollmentController],
  providers: [UsersService, EnrollmentService],
  exports: [UsersService, EnrollmentService],
})
export class IdentityModule {}
