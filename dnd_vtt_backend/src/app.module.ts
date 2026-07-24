import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { CharactersModule } from './characters/characters.module';
import { MapsModule } from './maps/maps.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'dnd_vtt_frontend', 'dist', 'dnd-app'),
      // Don't let the SPA fallback swallow API or WebSocket routes
      exclude: ['/api*', '/uploads*', '/socket.io*'],
    }),
    AuthModule,
    CharactersModule,
    MapsModule,
  ],
})
export class AppModule {}
