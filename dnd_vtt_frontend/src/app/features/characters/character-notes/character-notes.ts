import { Component, OnDestroy, effect, inject, input, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WikiService } from '../../../core/services/wiki.service';
import { WikiPage } from '../../../core/models/wiki.model';
import { WikiEditorPage, WikiLiveEditorComponent } from '../../wiki/wiki-live-editor';

const AUTOSAVE_MS = 1500;

// A character's private notebook: the owner-only page in the campaign wiki, edited inline in the
// sheet with the same live-preview markdown editor. The page itself is created server-side.
@Component({
  selector: 'app-character-notes',
  imports: [MatIconModule, MatTooltipModule, WikiLiveEditorComponent],
  template: `
    @if (loading()) {
      <div class="flex justify-center mt-10"><span class="spinner-lg"></span></div>
    } @else if (failed()) {
      <p class="text-slate">Could not load your notes.</p>
    } @else if (page(); as p) {
      <div class="flex items-center gap-2 mb-3 text-xs text-slate/70">
        <mat-icon class="text-[15px]" matTooltip="Only you can see these notes">lock</mat-icon>
        <span>Private notes</span>
        <span class="ml-auto w-14 text-right">
          @switch (saveState()) {
            @case ('saving') {
              Saving…
            }
            @case ('saved') {
              Saved
            }
            @case ('error') {
              <span class="text-danger">Error</span>
            }
          }
        </span>
        <button
          class="btn-icon"
          (click)="openInWiki(p.slug)"
          matTooltip="Open in the campaign wiki"
        >
          <mat-icon>open_in_new</mat-icon>
        </button>
      </div>
      @if (conflict()) {
        <div class="bg-danger/15 text-danger text-sm px-3 py-2 mb-3 rounded">
          These notes changed elsewhere.
          <button class="underline ml-1" (click)="load()">Reload</button>
        </div>
      }
      <div class="min-h-[50vh] cursor-text" (click)="focusEditor($event)">
        <app-wiki-live-editor
          [value]="body()"
          [pages]="pages()"
          [campaignId]="p.campaign_id"
          [flow]="true"
          (valueChange)="onChange($event)"
          (openLink)="openInWiki($event.slug)"
          (editorBlur)="flush()"
        />
      </div>
    }
  `,
})
export class CharacterNotesComponent implements OnDestroy {
  private wiki = inject(WikiService);
  private router = inject(Router);

  readonly characterId = input.required<string>();

  private editor = viewChild(WikiLiveEditorComponent);

  loading = signal(true);
  failed = signal(false);
  page = signal<WikiPage | null>(null);
  pages = signal<WikiEditorPage[]>([]);
  body = signal('');
  saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  conflict = signal(false);

  private timer?: ReturnType<typeof setTimeout>;
  private saving: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      this.characterId();
      void this.load();
    });
    window.addEventListener('beforeunload', this.onUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onUnload);
    this.flush();
  }

  private onUnload = () => this.flush();

  async load(): Promise<void> {
    this.conflict.set(false);
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { campaignId, slug } = await this.wiki.characterNotes(this.characterId());
      const [res, tree] = await Promise.all([
        this.wiki.page(campaignId, slug),
        this.wiki.tree(campaignId),
      ]);
      this.page.set(res.page);
      this.body.set(res.page.body);
      this.pages.set(tree.map((p) => ({ title: p.title, slug: p.slug })));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  onChange(value: string): void {
    this.body.set(value);
    this.saveState.set('idle');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
  }

  flush(): void {
    clearTimeout(this.timer);
    const p = this.page();
    if (!p || this.body() === p.body) return;
    this.saving = this.saving.then(() => this.save());
  }

  private async save(): Promise<void> {
    const p = this.page();
    const body = this.body();
    if (!p || body === p.body) return;
    this.saveState.set('saving');
    try {
      const res = await this.wiki.update(p.id, { body, expectedUpdatedAt: p.updated_at });
      // Keep the local draft; only advance the baseline so edits typed mid-save aren't clobbered.
      this.page.set({ ...p, body, updated_at: res.page.updated_at });
      this.saveState.set('saved');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) this.conflict.set(true);
      this.saveState.set('error');
    }
  }

  focusEditor(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.editor()?.focus();
  }

  openInWiki(slug: string): void {
    const p = this.page();
    if (!p) return;
    this.flush();
    void this.router.navigate(['/home/campaigns', p.campaign_id, 'wiki', slug]);
  }
}
