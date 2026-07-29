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
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('campaigns')
@UseGuards(JwtGuard)
export class CampaignsController {
  constructor(private campaigns: CampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.campaigns.findAllForUser(user);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: RequestUser) {
    return this.campaigns.create(user.id, dto);
  }

  @Post('join')
  join(@Body() dto: JoinCampaignDto, @CurrentUser() user: RequestUser) {
    return this.campaigns.join(user, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.update(id, user.id, dto);
  }

  @Post(':id/background')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadBackground(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.uploadBackground(id, user.id, file);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.remove(id, user.id);
  }

  @Get(':id/members')
  @UseGuards(AdminGuard)
  getMembers(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaigns.getMembers(id, user.id);
  }

  @Patch(':id/party-level')
  @UseGuards(AdminGuard)
  setPartyLevel(
    @Param('id') id: string,
    @Body() dto: SetPartyLevelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setPartyLevel(id, user.id, dto.level);
  }

  @Delete(':id/members/:userId')
  @UseGuards(AdminGuard)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.removeMember(id, user.id, userId);
  }

  @Patch(':id/members/:userId/edit-access')
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
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

  // Player-only, self-service — no AdminGuard, since this is the player's own choice about their
  // own membership row rather than something the DM grants (contrast setMemberEditAccess above).
  @Patch(':id/members/me/race-class-visibility')
  setOwnRaceClassVisibility(
    @Param('id') id: string,
    @Body() dto: SetRaceClassVisibilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.setOwnRaceClassVisibility(
      id,
      user.id,
      dto.visible,
    );
  }
}
