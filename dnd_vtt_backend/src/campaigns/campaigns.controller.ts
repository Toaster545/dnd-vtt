import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JoinCampaignDto } from './dto/join-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SetEditAccessDto } from './dto/set-edit-access.dto';
import { SetPartyVisibilityDto } from './dto/set-party-visibility.dto';
import { SetPartyLevelDto } from './dto/set-party-level.dto';
import { SetRaceClassVisibilityDto } from './dto/set-race-class-visibility.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

// No AdminGuard on any route here — campaign creation and management is scoped by ownership
// (campaign.dm_id === the caller), enforced inside CampaignsService itself, not by a global role.
// Any authenticated user can create a campaign (becoming its DM) or join one (becoming a member);
// see findAllForUser, which returns the union of both for the current user.
@Controller('campaigns')
@UseGuards(JwtGuard)
export class CampaignsController {
  constructor(private campaigns: CampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.campaigns.findAllForUser(user);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: RequestUser) {
    return this.campaigns.create(user.id, dto);
  }

  @Post('join')
  join(@Body() dto: JoinCampaignDto, @CurrentUser() user: RequestUser) {
    return this.campaigns.join(user, dto);
  }

  @Get('join-preview/:joinCode')
  previewJoin(
    @Param('joinCode') joinCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.previewJoin(user.id, joinCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.findOne(id, user);
  }

  @Get(':id/current-context')
  currentContext(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.getCurrentContext(id, user);
  }

  @Patch(':id/current-session')
  setCurrentSession(
    @Param('id') id: string,
    @Body() body: { session_id: string | null },
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setCurrentSession(id, user.id, body.session_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.update(id, user.id, dto);
  }

  @Post(':id/background')
  @UseInterceptors(FileInterceptor('file'))
  uploadBackground(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.uploadBackground(id, user.id, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.remove(id, user.id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.getMembers(id, user.id);
  }

  @Patch(':id/party-level')
  setPartyLevel(
    @Param('id') id: string,
    @Body() dto: SetPartyLevelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setPartyLevel(id, user.id, dto.level);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.removeMember(id, user.id, userId);
  }

  @Patch(':id/members/:userId/edit-access')
  setMemberEditAccess(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetEditAccessDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setMemberEditAccess(
      id,
      user.id,
      userId,
      dto.unlocked,
    );
  }

  @Patch(':id/members/:userId/party-visibility')
  setMemberPartyVisibility(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetPartyVisibilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setMemberPartyVisibility(
      id,
      user.id,
      userId,
      dto.visible,
    );
  }

  // Self-service — this is the player's own choice about their own membership row rather than
  // something the DM grants (contrast setMemberEditAccess above).
  @Patch(':id/members/me/race-class-visibility')
  setOwnRaceClassVisibility(
    @Param('id') id: string,
    @Body() dto: SetRaceClassVisibilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setOwnRaceClassVisibility(id, user.id, dto.visible);
  }
}
