import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

// No AdminGuard — session ownership is scoped to campaign.dm_id and checked inside
// SessionsService (see create/remove there), not a global role.
@Controller('sessions')
@UseGuards(JwtGuard)
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Get()
  findAll(
    @Query('campaignId') campaignId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.findAllForCampaign(campaignId, user);
  }

  @Post()
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: RequestUser) {
    return this.sessions.create(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.sessions.findOneForUser(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.update(id, user.id, dto);
  }

  @Post(':id/background')
  @UseInterceptors(FileInterceptor('file'))
  uploadBackground(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.uploadBackground(id, user.id, file);
  }

  @Patch(':id/visibility')
  setVisibility(
    @Param('id') id: string,
    @Body() body: { visible: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.setVisibility(id, user.id, body.visible);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.sessions.remove(id, user.id);
  }
}
