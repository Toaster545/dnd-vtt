import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MapsService } from './maps.service';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('maps')
@UseGuards(JwtGuard)
export class MapsController {
  constructor(private maps: MapsService) {}

  @Get()
  findAll() {
    return this.maps.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maps.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: Record<string, unknown>) {
    return this.maps.create(body);
  }

  @Post('upload')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('campaignId') campaignId: string,
  ) {
    return this.maps
      .uploadImage(file, campaignId ?? 'default')
      .then((url) => ({ url }));
  }

  @Get(':id/tokens')
  getTokens(@Param('id') id: string) {
    return this.maps.getTokens(id);
  }

  @Post(':id/tokens')
  @UseGuards(AdminGuard)
  upsertToken(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.maps.upsertToken(id, body);
  }

  @Delete(':id/tokens/:tokenId')
  @UseGuards(AdminGuard)
  deleteToken(@Param('id') mapId: string, @Param('tokenId') tokenId: string) {
    return this.maps.deleteToken(tokenId, mapId);
  }

  @Post(':id/tokens/:tokenId/reroll-initiative')
  @UseGuards(AdminGuard)
  rerollInitiative(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
  ) {
    return this.maps.rerollInitiative(mapId, tokenId);
  }

  @Get(':id/fog')
  getFog(@Param('id') id: string) {
    return this.maps.getFog(id);
  }

  @Post(':id/fog/toggle')
  @UseGuards(AdminGuard)
  setFogEnabled(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.maps.setFogEnabled(id, !!body.enabled);
  }

  @Post(':id/fog/paint')
  @UseGuards(AdminGuard)
  paintFog(
    @Param('id') id: string,
    @Body() body: { cells: { col: number; row: number }[]; revealed: boolean },
  ) {
    return this.maps.paintFog(id, body.cells ?? [], !!body.revealed);
  }

  @Post(':id/fog/reset')
  @UseGuards(AdminGuard)
  resetFog(@Param('id') id: string) {
    return this.maps.resetFog(id);
  }
}
