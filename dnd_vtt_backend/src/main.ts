import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  const origins = (
    process.env.CORS_ORIGINS ??
    'http://localhost:4200,https://dnd.mathomelab.ca,https://localhost,capacitor://localhost'
  )
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
      ? {
          setHeaders: (res: express.Response) =>
            res.setHeader('Cache-Control', 'no-store'),
        }
      : {};

  // Raw battle maps contain everything hidden by fog. They are served only through authenticated
  // map endpoints; other intentionally-public campaign/session assets keep their legacy URLs.
  server.use('/uploads/maps', (_req, res) => res.sendStatus(404));
  server.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  server.use(express.static(distPath, staticOpts));
  server.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io'))
        return next();
      res.sendFile(indexPath);
    },
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Running at http://0.0.0.0:${process.env.PORT ?? 3000}`);
}
void bootstrap();
