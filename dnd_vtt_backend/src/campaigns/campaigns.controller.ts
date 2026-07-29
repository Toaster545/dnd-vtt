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

  @Delete(':id/members/:userId')
  @UseGuards(AdminGuard)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaigns.removeMember(id, user.id, userId);
  }
}
