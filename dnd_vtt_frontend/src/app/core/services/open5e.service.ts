import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const BASE = 'https://api.open5e.com/v1';

export interface O5eRace {
  name: string;
  slug: string;
  asi: { attributes: string[]; value: number }[];
  speed: { walk: number };
  size_raw: string;
  subraces: { name: string; slug: string }[];
}

export interface O5eClass {
  name: string;
  slug: string;
  hit_dice: string;
  prof_saving_throws: string;
  prof_skills: string;
  archetypes: { name: string; slug: string }[];
  spellcasting_ability: string;
}

export interface O5eBackground {
  name: string;
  slug: string;
  skill_proficiencies: string | null;
}

interface ListResponse<T> { count: number; results: T[] }

@Injectable({ providedIn: 'root' })
export class Open5eService {
  private http = inject(HttpClient);
  private cache = new Map<string, unknown>();

  private async fetch<T>(url: string): Promise<T> {
    if (this.cache.has(url)) return this.cache.get(url) as T;
    const data = await firstValueFrom(this.http.get<T>(url));
    this.cache.set(url, data);
    return data;
  }

  async getRaces(): Promise<O5eRace[]> {
    const res = await this.fetch<ListResponse<O5eRace>>(`${BASE}/races/?limit=50`);
    return res.results;
  }

  async getClasses(): Promise<O5eClass[]> {
    const res = await this.fetch<ListResponse<O5eClass>>(`${BASE}/classes/?document__slug=wotc-srd&limit=20`);
    return res.results;
  }

  async getBackgrounds(): Promise<O5eBackground[]> {
    const res = await this.fetch<ListResponse<O5eBackground>>(`${BASE}/backgrounds/?limit=50`);
    return res.results;
  }
}
