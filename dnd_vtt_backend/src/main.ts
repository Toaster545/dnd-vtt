import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Accept a comma-separated list of allowed origins, e.g.:
  // CORS_ORIGINS=http://localhost:4200,http://192.168.86.151:4200
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  });

  // Serve uploaded map images as static files at /uploads/...
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Backend running at http://0.0.0.0:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
