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
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

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
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: RequestUser) {
    return this.sessions.create(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.sessions.findOneForUser(id, user);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.update(id, user.id, dto);
  }

  @Post(':id/background')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadBackground(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.uploadBackground(id, user.id, file);
  }

  @Patch(':id/visibility')
  @UseGuards(AdminGuard)
  setVisibility(
    @Param('id') id: string,
    @Body() body: { visible: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessions.setVisibility(id, user.id, body.visible);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.sessions.remove(id);
  }
}
