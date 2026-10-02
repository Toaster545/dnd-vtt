import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
    const file = await this.maps.getImageFile(id, user);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.sendFile(file);
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

  @Post(':id/tokens/:tokenId/move/confirm')
  confirmTokenMove(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.confirmTokenMove(mapId, tokenId, user);
  }

  @Post(':id/tokens/:tokenId/move/undo')
  undoTokenMove(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.undoTokenMove(mapId, tokenId, user);
  }

  @Get(':id/tokens/:tokenId/plan')
  getTokenPlan(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.getTokenPlan(mapId, tokenId, user);
  }

  @Put(':id/tokens/:tokenId/plan')
  setTokenPlan(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @Body() body: { x: number; y: number },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setTokenPlan(mapId, tokenId, body, user);
  }

  @Delete(':id/tokens/:tokenId/plan')
  clearTokenPlan(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setTokenPlan(mapId, tokenId, null, user);
  }

  @Delete(':id/tokens/:tokenId')
  deleteToken(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.deleteToken(tokenId, mapId, user);
  }

  @Post(':id/tokens/:tokenId/move')
  moveToken(
    @Param('id') mapId: string,
    @Param('tokenId') tokenId: string,
    @Body() body: { target_map_id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.moveTokenToMap(tokenId, mapId, body.target_map_id, user);
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

  @Put(':id/lighting/walls')
  setWalls(
    @Param('id') id: string,
    @Body() body: { walls: unknown },
    @CurrentUser() user: RequestUser,
  ) {
    return this.maps.setWalls(id, body?.walls, user);
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
