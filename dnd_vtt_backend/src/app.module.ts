import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CharactersModule } from './characters/characters.module';
import { ContentModule } from './content/content.module';
import { MapsModule } from './maps/maps.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CharactersModule,
    ContentModule,
    MapsModule,
    SessionsModule,
  ],
})
export class AppModule {}
