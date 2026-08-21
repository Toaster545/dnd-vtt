import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  ContentService,
  DndBackground,
  DndClass,
  DndContentSource,
  DndFeat,
  DndRace,
} from '../../../core/services/content.service';
import { ContentSourceFilterComponent } from '../content-source-filter/content-source-filter';
import { PlayerOptionDetailDialogComponent } from './player-option-detail-dialog';

export type PlayerOptionKind = 'species' | 'classes' | 'backgrounds' | 'feats';
type PlayerOption = DndRace | DndClass | DndBackground | DndFeat;
type PlayerOptionSort = 'name-asc' | 'name-desc' | 'source-asc';

@Component({
  selector: 'app-player-option-library',
  imports: [FormsModule, MatIconModule, ContentSourceFilterComponent, PlayerOptionDetailDialogComponent],
  templateUrl: './player-option-library.html',
})
export class PlayerOptionLibraryComponent implements OnInit {
  private readonly content = inject(ContentService);

  readonly kind = input.required<PlayerOptionKind>();
  readonly entries = signal<PlayerOption[]>([]);
  readonly sources = signal<DndContentSource[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly search = signal('');
  readonly sourceFilters = signal<string[]>([]);
  readonly sort = signal<PlayerOptionSort>('name-asc');
  readonly selected = signal<PlayerOption | null>(null);

  readonly title = computed(() => ({
    species: 'Species',
    classes: 'Classes',
    backgrounds: 'Backgrounds',
    feats: 'Feats',
  })[this.kind()]);

  readonly availableSources = computed(() => {
    const codes = new Set(this.entries().flatMap(entry => this.sourceCodes(entry)));
    return this.sources().filter(source => codes.has(source.code));
  });

  readonly filteredEntries = computed(() => {
    const query = this.search().trim().toLowerCase();
    const selectedSources = this.sourceFilters();
    const filtered = this.entries().filter(entry =>
      (!query || entry.name.toLowerCase().includes(query)) &&
      (selectedSources.length === 0 || this.sourceCodes(entry).some(code => selectedSources.includes(code))),
    );
    return filtered.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      switch (this.sort()) {
        case 'name-desc': return -byName;
        case 'source-asc': return this.sourceLabel(a).localeCompare(this.sourceLabel(b)) || byName;
        default: return byName;
      }
    });
  });

  async ngOnInit() {
    this.loading.set(true);
    const entriesRequest = {
      species: () => this.content.getRaces(),
      classes: () => this.content.getClasses(),
      backgrounds: () => this.content.getBackgrounds(),
      feats: () => this.content.getFeats(),
    }[this.kind()];
    const [entries, sources] = await Promise.all([entriesRequest(), this.content.getSources()]);
    this.entries.set(entries);
    this.sources.set(sources);
    this.loading.set(false);
  }

  setSourceFilters(codes: string[]) { this.sourceFilters.set(codes); }
  openDetails(entry: PlayerOption) { this.selected.set(entry); }
  closeDetails() { this.selected.set(null); }

  sourceLabel(entry: PlayerOption): string {
    if (this.isClass(entry)) {
      return [...new Set([entry.source?.book, ...entry.subclasses.map(subclass => subclass.source?.book)].filter(Boolean))].join(', ');
    }
    return entry.source?.book ?? 'Published Content';
  }

  subtitle(entry: PlayerOption): string {
    if (this.isRace(entry)) {
      const subraces = entry.subraces.length ? ` · ${entry.subraces.length} lineage${entry.subraces.length === 1 ? '' : 's'}` : '';
      return `${entry.size} ${entry.creature_type} · ${entry.speed} ft.${subraces}`;
    }
    if (this.isClass(entry)) {
      const ability = entry.primary_abilities?.join(' or ') || 'Varies';
      return `d${entry.hit_die} Hit Die · ${ability} · ${entry.subclasses.length} subclass${entry.subclasses.length === 1 ? '' : 'es'}`;
    }
    if (this.isBackground(entry)) {
      return entry.skill_proficiencies.length ? entry.skill_proficiencies.join(', ') : 'No fixed skill proficiencies';
    }
    return `${this.categoryLabel(entry.category)} feat${entry.prerequisite?.level ? ` · Level ${entry.prerequisite.level}+` : ''}`;
  }

  featCategory(entry: PlayerOption): string | null {
    return this.isFeat(entry) ? this.categoryLabel(entry.category) : null;
  }

  private categoryLabel(category: DndFeat['category']): string {
    return ({ origin: 'Origin', general: 'General', fighting_style: 'Fighting Style', epic: 'Epic Boon' })[category];
  }

  private sourceCodes(entry: PlayerOption): string[] {
    if (this.isClass(entry)) {
      return [...new Set([entry.source?.code, ...entry.subclasses.map(subclass => subclass.source?.code)].filter((code): code is string => !!code))];
    }
    return entry.source?.code ? [entry.source.code] : [];
  }

  private isRace(entry: PlayerOption): entry is DndRace { return 'creature_type' in entry; }
  private isClass(entry: PlayerOption): entry is DndClass { return 'hit_die' in entry; }
  private isBackground(entry: PlayerOption): entry is DndBackground { return 'skill_proficiencies' in entry; }
  private isFeat(entry: PlayerOption): entry is DndFeat { return 'category' in entry; }
}
