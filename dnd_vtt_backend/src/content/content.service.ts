import { Injectable, NotFoundException } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CONTENT_PATH = join(process.cwd(), 'content');

@Injectable()
export class ContentService {
  private cache = new Map<string, unknown>();

  private loadAll<T>(type: string): T[] {
    const key = `all:${type}`;
    if (this.cache.has(key)) return this.cache.get(key) as T[];
    const dir = join(CONTENT_PATH, type);
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    const items = files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T);
    this.cache.set(key, items);
    return items;
  }

  private loadOne<T>(type: string, index: string): T {
    const key = `${type}:${index}`;
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const file = join(CONTENT_PATH, type, `${index}.json`);
    try {
      const item = JSON.parse(readFileSync(file, 'utf-8')) as T;
      this.cache.set(key, item);
      return item;
    } catch {
      throw new NotFoundException(`${type}/${index} not found`);
    }
  }

  getClasses()                  { return this.loadAll('classes'); }
  getClass(index: string)       { return this.loadOne('classes', index); }
  getRaces()                    { return this.loadAll('races'); }
  getRace(index: string)        { return this.loadOne('races', index); }
  getBackgrounds()              { return this.loadAll('backgrounds'); }
  getBackground(index: string)  { return this.loadOne('backgrounds', index); }
}
