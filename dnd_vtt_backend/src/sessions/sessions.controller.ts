import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
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
