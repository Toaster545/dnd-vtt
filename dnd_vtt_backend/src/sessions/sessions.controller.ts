import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('sessions')
@UseGuards(JwtGuard, AdminGuard)
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Get()
  findAll() {
    return this.sessions.findAll();
  }

  @Post()
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: RequestUser) {
    return this.sessions.create(user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessions.remove(id);
  }
}
