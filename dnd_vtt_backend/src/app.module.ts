import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BackgroundsModule } from './backgrounds/backgrounds.module';
import { CharactersModule } from './characters/characters.module';
import { ContentModule } from './content/content.module';
import { MapsModule } from './maps/maps.module';
import { SessionsModule } from './sessions/sessions.module';
import { EncountersModule } from './encounters/encounters.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { NotesModule } from './notes/notes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    BackgroundsModule,
    CharactersModule,
    ContentModule,
    MapsModule,
    SessionsModule,
    EncountersModule,
    CampaignsModule,
    NotesModule,
  ],
})
export class AppModule {}
