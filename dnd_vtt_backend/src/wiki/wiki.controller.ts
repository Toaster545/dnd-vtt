import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WikiService } from './wiki.service';
import { CreateWikiPageDto } from './dto/create-wiki-page.dto';
import { UpdateWikiPageDto } from './dto/update-wiki-page.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('wiki')
@UseGuards(JwtGuard)
export class WikiController {
  constructor(private wiki: WikiService) {}

  @Get()
  tree(
    @Query('campaignId') campaignId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.tree(campaignId, user);
  }

  @Get(':campaignId/search')
  search(
    @Param('campaignId') campaignId: string,
    @Query('q') q: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.search(campaignId, user, q ?? '');
  }

  @Get(':campaignId/graph')
  graph(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.graph(campaignId, user);
  }

  @Post(':campaignId/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadImage(
    @Param('campaignId') campaignId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.uploadImage(campaignId, user, file);
  }

  @Get(':campaignId/page/:slug')
  page(
    @Param('campaignId') campaignId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.getPage(campaignId, slug, user);
  }

  @Post()
  create(@Body() dto: CreateWikiPageDto, @CurrentUser() user: RequestUser) {
    return this.wiki.create(user, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wiki.update(id, user, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.wiki.remove(id, user);
  }
}
