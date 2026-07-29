import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import type { NoteEntityType } from './dto/create-note.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('notes')
@UseGuards(JwtGuard)
export class NotesController {
  constructor(private notes: NotesService) {}

  @Get()
  list(
    @Query('entityType') entityType: NoteEntityType,
    @Query('entityId') entityId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notes.list(entityType, entityId, user);
  }

  @Post()
  create(@Body() dto: CreateNoteDto, @CurrentUser() user: RequestUser) {
    return this.notes.create(user, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { content: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.notes.update(id, user, body.content);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notes.remove(id, user);
  }
}
