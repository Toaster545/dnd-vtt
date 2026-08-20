import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DndContentSource } from '../../../core/services/content.service';

export interface ContentSourceDialogData {
  sources: DndContentSource[];
  enabledCodes: string[];
  allowedCodes: string[] | null;
}

@Component({
  selector: 'app-content-source-dialog',
  imports: [MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="font-brand text-parchment">Character Sources</h2>
    <mat-dialog-content class="!px-6 !py-2">
      <p class="text-slate text-sm mt-0 mb-4">
        Select the books whose character options should be available. The Player's Handbook is always included.
      </p>

      <div class="relative mb-4">
        <mat-icon class="absolute left-3 top-2.5 text-slate text-lg">search</mat-icon>
        <input
          class="field-input pl-10 w-full"
          type="search"
          placeholder="Find a source…"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </div>

      <div class="flex flex-col gap-2 min-h-32 max-h-[52vh] overflow-y-auto pr-1" style="width: min(580px, 75vw);">
        @for (source of filteredSources(); track source.code) {
          @let unavailable = unavailableInCampaign(source);
          <button
            type="button"
            class="flex items-start gap-3 rounded-md border p-3 text-left transition-colors"
            [class]="enabled(source.code)
              ? 'border-gold/45 bg-gold/8'
              : unavailable
                ? 'border-white/5 opacity-50 cursor-not-allowed'
                : 'border-white/10 hover:border-white/25 cursor-pointer'"
            [disabled]="unavailable || source.locked"
            (click)="toggle(source)"
          >
            <span
              class="w-5 h-5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0"
              [class]="enabled(source.code) ? 'bg-gold border-gold text-canvas' : 'border-slate/50 text-transparent'"
            >
              <mat-icon class="text-sm leading-none">check</mat-icon>
            </span>
            <span class="flex-1 min-w-0">
              <span class="flex items-center gap-2">
                <span class="text-parchment text-sm font-medium">{{ source.name }}</span>
                <span class="text-[10px] text-coal border border-white/10 rounded px-1.5 py-0.5">{{ source.code }}</span>
                @if (source.default_enabled) {
                  <span class="text-[10px] text-gold">Base</span>
                }
              </span>
              <span class="block text-slate text-xs mt-1">{{ source.description }}</span>
              @if (unavailable) {
                <span class="block text-danger text-xs mt-1">Not allowed by this campaign.</span>
              }
            </span>
          </button>
        } @empty {
          <p class="text-slate text-sm py-6 text-center">No sources match that search.</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions class="!px-6 !pb-5 gap-2">
      <button class="btn-ghost" type="button" (click)="selectAll()">Select all</button>
      <button class="btn-ghost" type="button" (click)="deselectAll()">Deselect all</button>
      <span class="flex-1"></span>
      <button class="btn-ghost" type="button" [mat-dialog-close]="null">Cancel</button>
      <button class="btn-primary" type="button" [mat-dialog-close]="selectedCodes()">Apply Sources</button>
    </mat-dialog-actions>
  `,
})
export class ContentSourceDialogComponent {
  readonly data = inject<ContentSourceDialogData>(MAT_DIALOG_DATA);
  readonly search = signal('');
  readonly selected = signal(new Set(this.data.enabledCodes));
  private readonly allowed = this.data.allowedCodes
    ? new Set(this.data.allowedCodes)
    : null;

  readonly filteredSources = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.data.sources.filter(source =>
      source.player_options &&
      (!query || `${source.name} ${source.short_name} ${source.code}`.toLowerCase().includes(query)),
    );
  });

  readonly selectedCodes = computed(() =>
    this.data.sources
      .filter(source => source.player_options && this.selected().has(source.code))
      .map(source => source.code),
  );

  enabled(code: string): boolean {
    return this.selected().has(code);
  }

  unavailableInCampaign(source: DndContentSource): boolean {
    return this.allowed !== null && !this.allowed.has(source.code) && !this.enabled(source.code);
  }

  toggle(source: DndContentSource) {
    if (source.locked || this.unavailableInCampaign(source)) return;
    this.selected.update(current => {
      const next = new Set(current);
      if (next.has(source.code)) next.delete(source.code);
      else {
        next.add(source.code);
        for (const required of source.requires) next.add(required);
      }
      return next;
    });
  }

  selectAll() {
    this.selected.set(new Set(
      this.data.sources
        .filter(source => source.player_options && (this.allowed === null || this.allowed.has(source.code)))
        .map(source => source.code),
    ));
  }

  deselectAll() {
    this.selected.set(new Set(
      this.data.sources
        .filter(source => source.player_options && source.locked)
        .map(source => source.code),
    ));
  }
}
