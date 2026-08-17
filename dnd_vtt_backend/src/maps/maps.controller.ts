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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  findAll(
    @Query('campaignId') campaignId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.findAll(campaignId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.findOne(id, user);
  }

  @Get(':id/player-state')
  playerState(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.getPlayerState(id, user);
  }

  @Get(':id/image')
  async image(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ) {
    const file = await this.maps.getImageFile(id, user, true);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.sendFile(file);
  }

  @Get(':id/player-image')
  async playerImage(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ) {
    const image = await this.maps.getPlayerImage(id, user);
    response.setHeader('Cache-Control', 'private, no-store');
    response.type('image/png');
    return response.send(image);
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
  getTokens(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.getTokens(id, user);
  }

  @Post(':id/tokens')
  upsertToken(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.upsertToken(id, body, user);
  }

  @Post(':id/tokens/:tokenId/color')
  setTokenColor(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @Body() body: { color: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setTokenColor(mapId, tokenId, body.color, user);
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
  getFog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.getFog(id, user);
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

  @Get(':id/lighting')
  getLighting(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.maps.getLighting(id, user);
  }

  @Post(':id/lighting/toggle')
  setLightingEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setLightingEnabled(id, !!body.enabled, user);
  }

  @Post(':id/lighting/lights')
  upsertLight(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.upsertLight(id, body, user);
  }

  @Delete(':id/lighting/lights/:lightId')
  deleteLight(
    @Param('id') mapId: string,
    @Param('lightId') lightId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.deleteLight(lightId, mapId, user);
  }
}
