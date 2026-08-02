import { Controller, Get } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { extname, join } from 'path';

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
]);

// Unauthenticated GET, same as ContentModule's static-content reads — lists whatever image
// files a DM has dropped into uploads/backgrounds/ so Settings can offer them as app background
// choices with zero code changes (see BackgroundService on the frontend).
@Controller('backgrounds')
export class BackgroundsController {
  @Get()
  list(): { id: string; url: string }[] {
    const dir = join(process.cwd(), 'uploads', 'backgrounds');
    if (!existsSync(dir)) return [];

    return readdirSync(dir)
      .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort()
      .map((f) => ({ id: f, url: `/uploads/backgrounds/${f}` }));
  }
}
