import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, raw } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('trust proxy', 1);
  app.use(helmet());
  app.useWebSocketAdapter(new IoAdapter(app)); // socket.io for the /agent gateway
  // GitHub release webhook needs the RAW body for HMAC verification.
  // Must be registered before json() so that route is not JSON-parsed.
  app.use('/agent/update/webhook', raw({ type: '*/*', limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' })); // /token is form-encoded
  app.use(json({ limit: '4mb' })); // /mcp JSON-RPC
  await app.listen(Number(process.env.PORT ?? 3000));
  console.log('App live on port', Number(process.env.PORT ?? 3000));
}
void bootstrap();
