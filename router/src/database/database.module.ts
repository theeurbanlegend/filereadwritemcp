import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import dataSource from './data-source';

// Single source of truth for the DB connection, shared by AppModule (the HTTP
// router) and CliModule (the admin CLI). Reads DATABASE_URL from the environment.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => dataSource.options,
    }),
  ],
})
export class DatabaseModule {}
