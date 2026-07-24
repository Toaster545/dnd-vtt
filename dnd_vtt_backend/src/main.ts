import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // In production requests are same-origin (NestJS serves the Angular build).
  // CORS is only needed for local development (ng serve on :4200 → API on :3000).
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: 'http://localhost:4200', credentials: true });
  }

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Running at http://0.0.0.0:${process.env.PORT ?? 3000}`);
}
bootstrap();
