import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config(); // loads from process env (Railway injects these)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({
  path: path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'packages',
    'database',
    '.env',
  ),
});

// Throw startup errors if JWT secrets are missing
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing');
}
if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is missing');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : false;
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Only connect Redis adapter if REDIS_URL is available
  if (process.env.REDIS_URL) {
    try {
      const redisIoAdapter = new RedisIoAdapter(app);
      await redisIoAdapter.connectToRedis();
      app.useWebSocketAdapter(redisIoAdapter);
    } catch (e) {
      console.warn('Redis not available, using default WebSocket adapter');
    }
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on port ${port}`);
}
bootstrap();
