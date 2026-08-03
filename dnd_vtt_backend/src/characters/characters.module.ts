import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [AuthModule, ContentModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
