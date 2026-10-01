import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EncountersModule } from '../encounters/encounters.module';

@Module({
  imports: [AuthModule, ContentModule, EncountersModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
