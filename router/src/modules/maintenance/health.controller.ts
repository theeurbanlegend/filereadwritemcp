import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller('api/health')
export class HealthController {
  constructor(private readonly db: DataSource) {}

  @Get()
  @HttpCode(200)
  async health(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', database: 'ok' };
    } catch {
      res.status(503);
      return { status: 'error', database: 'unreachable' };
    }
  }
}
