import { InventoryService } from './inventory.service';
import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EncountersModule } from '../encounters/encounters.module';
import { CompanionsModule } from '../companions/companions.module';
import { CompanionsController } from '../companions/companions.controller';

@Module({
  imports: [AuthModule, ContentModule, EncountersModule, CompanionsModule],
  controllers: [CharactersController, CompanionsController],
  providers: [CharactersService, InventoryService],
})
export class CharactersModule {}
