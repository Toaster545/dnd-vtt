import { corsOptions, isDevBypass } from './config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (isDevBypass()) {
    Logger.warn(
      'DEV_BYPASS=true: the bearer token "dev" is accepted as admin. Do not expose this server publicly.',
      'Bootstrap',
    );
  }

  app.setGlobalPrefix('api');
  // Nest's 100kb JSON default is too small for a big map's wall set (PUT /maps/:id/lighting/walls
  // — a .dd2vtt dungeon import can carry thousands of segments).
  app.useBodyParser('json', { limit: '1mb' });

  app.enableCors(corsOptions());

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
  const staticOpts = isDevBypass()
    ? {
        setHeaders: (res: express.Response) =>
          res.setHeader('Cache-Control', 'no-store'),
      }
    : {};

  // Raw battle maps contain everything hidden by fog. They are served only through authenticated
  // map endpoints; other intentionally-public campaign/session assets keep their legacy URLs.
  server.use('/uploads/maps', (_req, res) => res.sendStatus(404));
  server.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  // Bundled, curated game-icons.net library (CC BY 3.0) DMs can pick from for item images,
  // instead of uploading their own — see content/icons/manifest.json for the credited author
  // per icon.
  server.use(
    '/icons',
    express.static(join(process.cwd(), 'content', 'icons', 'svg')),
  );
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
