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
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

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
  create(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.create(body, user);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('campaignId') campaignId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps
      .uploadImage(file, campaignId ?? 'default', user)
      .then((url) => ({ url }));
  }

  @Get(':id/tokens')
  getTokens(@Param('id') id: string) {
    return this.maps.getTokens(id);
  }

  @Post(':id/tokens')
  upsertToken(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.upsertToken(id, body, user);
  }

  @Delete(':id/tokens/:tokenId')
  deleteToken(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.deleteToken(tokenId, mapId, user);
  }

  @Post(':id/tokens/:tokenId/reroll-initiative')
  rerollInitiative(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.rerollInitiative(mapId, tokenId, user);
  }

  @Get(':id/fog')
  getFog(@Param('id') id: string) {
    return this.maps.getFog(id);
  }

  @Post(':id/fog/toggle')
  setFogEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setFogEnabled(id, !!body.enabled, user);
  }

  @Post(':id/fog/paint')
  paintFog(
    @Param('id') id: string,
    @Body() body: { cells: { col: number; row: number }[]; revealed: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.paintFog(id, body.cells ?? [], !!body.revealed, user);
  }

  @Post(':id/fog/reset')
  resetFog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.resetFog(id, user);
  }
}
