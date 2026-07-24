import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

const BASE = 'https://api.open5e.com/v1';

interface ListResponse<T> {
  results: T[];
}

@Injectable({ providedIn: 'root' })
export class Open5eService {
  private http = inject(HttpClient);

  getRaces(): Observable<string[]> {
    return this.http
      .get<ListResponse<{ name: string }>>(`${BASE}/races/?limit=50`)
      .pipe(map(r => r.results.map(x => x.name)));
  }

  getClasses(): Observable<string[]> {
    return this.http
      .get<ListResponse<{ name: string }>>(`${BASE}/classes/?limit=50`)
      .pipe(map(r => r.results.map(x => x.name)));
  }

  getBackgrounds(): Observable<string[]> {
    return this.http
      .get<ListResponse<{ name: string }>>(`${BASE}/backgrounds/?limit=50`)
      .pipe(map(r => r.results.map(x => x.name)));
  }

  getSpells(className?: string): Observable<{ name: string; level: number }[]> {
    const url = className
      ? `${BASE}/spells/?limit=500&dnd_class=${className}`
      : `${BASE}/spells/?limit=500`;
    return this.http
      .get<ListResponse<{ name: string; spell_level: number }>>(url)
      .pipe(map(r => r.results.map(x => ({ name: x.name, level: x.spell_level }))));
  }
}
