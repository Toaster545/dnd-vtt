import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const distPath = join(
    process.cwd(),
    '..',
    'dnd_vtt_frontend',
    'dist',
    'dnd-app',
    'browser',
  );
  const indexPath = join(distPath, 'index.html');
  const server = app.getHttpAdapter().getInstance();

  // Register directly on the raw Express instance to guarantee order
  const staticOpts =
    process.env.DEV_BYPASS === 'true'
      ? { setHeaders: (res: any) => res.setHeader('Cache-Control', 'no-store') }
      : {};

  server.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  server.use(express.static(distPath, staticOpts));
  server.use((req: any, res: any, next: any) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io'))
      return next();
    res.sendFile(indexPath);
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Running at http://0.0.0.0:${process.env.PORT ?? 3000}`);
}
bootstrap();
