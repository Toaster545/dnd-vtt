import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('classes') getClasses() {
    return this.content.getClasses();
  }
  @Get('classes/:index') getClass(@Param('index') i: string) {
    return this.content.getClass(i);
  }
  @Get('races') getRaces() {
    return this.content.getRaces();
  }
  @Get('races/:index') getRace(@Param('index') i: string) {
    return this.content.getRace(i);
  }
  @Get('backgrounds') getBackgrounds() {
    return this.content.getBackgrounds();
  }
  @Get('backgrounds/:index') getBackground(@Param('index') i: string) {
    return this.content.getBackground(i);
  }
  @Get('items') getItems() {
    return this.content.getItems();
  }
  @Get('items/:index') getItem(@Param('index') i: string) {
    return this.content.getItem(i);
  }
  @Get('spells') getSpells() {
    return this.content.getSpells();
  }
  @Get('spells/:index') getSpell(@Param('index') i: string) {
    return this.content.getSpell(i);
  }
  @Get('feats') getFeats() {
    return this.content.getFeats();
  }
  @Get('feats/:index') getFeat(@Param('index') i: string) {
    return this.content.getFeat(i);
  }
  @Get('monsters') getMonsters() {
    return this.content.getMonsters();
  }
  @Get('monsters/:index') getMonster(@Param('index') i: string) {
    return this.content.getMonster(i);
  }
  @Post('monsters')
  @UseGuards(JwtGuard, AdminGuard)
  createMonster(@Body() dto: CreateMonsterDto) {
    return this.content.saveMonster(dto);
  }
  @Put('monsters/:index')
  @UseGuards(JwtGuard, AdminGuard)
  updateMonster(@Param('index') index: string, @Body() dto: CreateMonsterDto) {
    return this.content.updateMonster(index, dto);
  }
}
