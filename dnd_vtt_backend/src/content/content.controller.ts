import { Controller, Get, Param } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('classes')              getClasses()                          { return this.content.getClasses(); }
  @Get('classes/:index')       getClass(@Param('index') i: string)  { return this.content.getClass(i); }
  @Get('races')                getRaces()                            { return this.content.getRaces(); }
  @Get('races/:index')         getRace(@Param('index') i: string)   { return this.content.getRace(i); }
  @Get('backgrounds')          getBackgrounds()                      { return this.content.getBackgrounds(); }
  @Get('backgrounds/:index')   getBackground(@Param('index') i: string) { return this.content.getBackground(i); }
  @Get('items')                getItems()                                { return this.content.getItems(); }
  @Get('items/:index')         getItem(@Param('index') i: string)       { return this.content.getItem(i); }
  @Get('spells')               getSpells()                               { return this.content.getSpells(); }
  @Get('spells/:index')        getSpell(@Param('index') i: string)      { return this.content.getSpell(i); }
}
