import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CreateMonsterDto } from './dto/create-monster.dto';

const CONTENT_PATH = join(process.cwd(), 'content');

@Injectable()
export class ContentService {
  private cache = new Map<string, unknown>();

  private loadAll<T>(type: string): T[] {
    const key = `all:${type}`;
    if (this.cache.has(key)) return this.cache.get(key) as T[];
    const dir = join(CONTENT_PATH, type);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const items = files.map(
      (f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T,
    );
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

  getClasses() {
    return this.loadAll('classes');
  }
  getClass(index: string) {
    return this.loadOne('classes', index);
  }
  getRaces() {
    return this.loadAll('races');
  }
  getRace(index: string) {
    return this.loadOne('races', index);
  }
  getBackgrounds() {
    return this.loadAll('backgrounds');
  }
  getBackground(index: string) {
    return this.loadOne('backgrounds', index);
  }
  getItems() {
    return this.loadAll('items');
  }
  getItem(index: string) {
    return this.loadOne('items', index);
  }
  getSpells() {
    return this.loadAll('spells');
  }
  getSpell(index: string) {
    return this.loadOne('spells', index);
  }
  getFeats() {
    return this.loadAll('feats');
  }
  getFeat(index: string) {
    return this.loadOne('feats', index);
  }
  getMonsters() {
    return this.loadAll('monsters');
  }
  getMonster(index: string) {
    return this.loadOne('monsters', index);
  }

  // Persists a DM-authored monster as a new content/monsters/<index>.json file, alongside the
  // built-in SRD-derived ones. Refuses to overwrite an existing index rather than clobbering it.
  saveMonster(dto: CreateMonsterDto) {
    const file = join(CONTENT_PATH, 'monsters', `${dto.index}.json`);
    if (existsSync(file)) {
      throw new ConflictException(`Monster "${dto.index}" already exists`);
    }
    writeFileSync(file, JSON.stringify(dto, null, 2) + '\n', 'utf-8');
    this.cache.delete('all:monsters');
    this.cache.set(`monsters:${dto.index}`, dto);
    return dto;
  }

  // The index is the filename, so it can't be changed from an edit — the caller renames by
  // deleting and re-creating instead (not currently exposed; no delete endpoint yet either).
  updateMonster(index: string, dto: CreateMonsterDto) {
    if (dto.index !== index) {
      throw new BadRequestException('Monster index cannot be changed');
    }
    const file = join(CONTENT_PATH, 'monsters', `${index}.json`);
    if (!existsSync(file)) {
      throw new NotFoundException(`Monster "${index}" not found`);
    }
    writeFileSync(file, JSON.stringify(dto, null, 2) + '\n', 'utf-8');
    this.cache.delete('all:monsters');
    this.cache.set(`monsters:${index}`, dto);
    return dto;
  }
}
