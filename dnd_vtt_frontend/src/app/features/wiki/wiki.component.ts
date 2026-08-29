import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WikiService } from '../../core/services/wiki.service';
import { ConfirmService } from '../../shared/confirm.service';
import {
  WikiBacklink,
  WikiPage,
  WikiPageSummary,
  WikiSearchHit,
} from '../../core/models/wiki.model';
import { renderWikiMarkdown } from './wiki-markdown';
import { WikiEditorComponent } from './wiki-editor.component';

interface FolderGroup {
  folder: string;
  pages: WikiPageSummary[];
}

@Component({
  selector: 'app-wiki',
  imports: [
    NgClass,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatTooltipModule,
    WikiEditorComponent,
  ],
  templateUrl: './wiki.component.html',
  styleUrl: './wiki.component.scss',
  host: { class: 'flex flex-1 min-h-0 overflow-hidden' },
})
export class WikiComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wiki = inject(WikiService);
  private confirm = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  private previewEl = viewChild<ElementRef<HTMLElement>>('preview');

  readonly campaignId: string = this.route.snapshot.paramMap.get('campaignId')!;
  readonly isDm: boolean = !!this.route.snapshot.data['wikiDm'];
  readonly wikiBase = this.isDm
    ? ['/home/campaigns/manage', this.campaignId, 'wiki']
    : ['/home/campaigns', this.campaignId, 'wiki'];

  private slug = toSignal(
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: this.route.snapshot.paramMap },
  );
  readonly currentSlug = computed(() => this.slug()?.get('slug') ?? null);

  tree = signal<WikiPageSummary[]>([]);
  page = signal<WikiPage | null>(null);
  backlinks = signal<WikiBacklink[]>([]);
  loadingTree = signal(true);
  loadingPage = signal(false);
  notFound = signal(false);

  editing = signal(false);
  draftTitle = signal('');
  draftBody = signal('');
  draftFolder = signal('');
  saving = signal(false);
  conflict = signal(false);
  errorMsg = signal<string | null>(null);

  q = signal('');
  searchResults = signal<WikiSearchHit[]>([]);
  searching = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly slugSet = computed(() => new Set(this.tree().map((p) => p.slug)));
  readonly editorPages = computed(() =>
    this.tree().map((p) => ({ title: p.title, slug: p.slug })),
  );

  readonly folderGroups = computed<FolderGroup[]>(() => {
    const map = new Map<string, WikiPageSummary[]>();
    for (const p of this.tree()) {
      const key = p.folder ?? '';
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, pages]) => ({ folder, pages }));
  });

  readonly previewSource = computed(() =>
    this.editing() ? this.draftBody() : (this.page()?.body ?? ''),
  );
  readonly renderedHtml = computed(() =>
    renderWikiMarkdown(this.previewSource()),
  );

  readonly canEditCurrent = computed(() => {
    const p = this.page();
    if (!p) return false;
    return this.isDm || p.visibility === 'shared';
  });

  constructor() {
    void this.loadTree();

    effect(() => {
      const slug = this.currentSlug();
      // Leaving edit mode whenever the route target changes keeps drafts from bleeding across
      // pages; an explicit save/cancel is required before navigating anyway.
      this.editing.set(false);
      this.conflict.set(false);
      if (slug) void this.loadPage(slug);
      else {
        this.page.set(null);
        this.backlinks.set([]);
        this.notFound.set(false);
      }
    });

    // Mark unresolved `[[links]]` in the rendered preview once the DOM for this html exists.
    effect(() => {
      this.renderedHtml();
      const known = this.slugSet();
      queueMicrotask(() => {
        const root = this.previewEl()?.nativeElement;
        if (!root) return;
        root.querySelectorAll<HTMLAnchorElement>('a.wiki-link').forEach((a) => {
          const slug = a.dataset['slug'] ?? '';
          a.classList.toggle('wiki-link--missing', !!slug && !known.has(slug));
        });
      });
    });
  }

  // ── loading ────────────────────────────────────────────────────────────────

  private async loadTree(): Promise<void> {
    this.loadingTree.set(true);
    try {
      this.tree.set(await this.wiki.tree(this.campaignId));
    } finally {
      this.loadingTree.set(false);
    }
  }

  private async loadPage(slug: string): Promise<void> {
    this.loadingPage.set(true);
    this.notFound.set(false);
    try {
      const res = await this.wiki.page(this.campaignId, slug);
      this.page.set(res.page);
      this.backlinks.set(res.backlinks);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.page.set(null);
        this.backlinks.set([]);
        this.notFound.set(true);
      } else {
        this.errorMsg.set('Could not load this page.');
      }
    } finally {
      this.loadingPage.set(false);
    }
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  openPage(slug: string): void {
    void this.router.navigate([...this.wikiBase, slug]);
  }

  onPreviewClick(ev: MouseEvent): void {
    const anchor = (ev.target as HTMLElement).closest(
      'a.wiki-link',
    ) as HTMLAnchorElement | null;
    if (!anchor) return;
    ev.preventDefault();
    const slug = anchor.dataset['slug'] ?? '';
    const title = anchor.dataset['title'] ?? '';
    if (!slug) return;
    if (this.slugSet().has(slug)) this.openPage(slug);
    else void this.createPage(title);
  }

  // ── mutations ──────────────────────────────────────────────────────────────

  async createPage(title?: string): Promise<void> {
    const name = (title ?? window.prompt('New page title')?.trim() ?? '').trim();
    if (!name) return;
    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      const res = await this.wiki.create({
        campaignId: this.campaignId,
        title: name,
        folder: this.page()?.folder ?? '',
      });
      await this.loadTree();
      this.openPage(res.page.slug);
    } catch {
      this.errorMsg.set('Could not create the page.');
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(): void {
    const p = this.page();
    if (!p) return;
    this.draftTitle.set(p.title);
    this.draftBody.set(p.body);
    this.draftFolder.set(p.folder);
    this.conflict.set(false);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.conflict.set(false);
  }

  async save(force = false): Promise<void> {
    const p = this.page();
    if (!p) return;
    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      const res = await this.wiki.update(p.id, {
        title: this.draftTitle().trim() || p.title,
        body: this.draftBody(),
        folder: this.draftFolder().trim(),
        expectedUpdatedAt: force ? undefined : p.updated_at,
      });
      this.page.set(res.page);
      this.backlinks.set(res.backlinks);
      this.editing.set(false);
      this.conflict.set(false);
      await this.loadTree();
      if (res.page.slug !== p.slug) this.openPage(res.page.slug);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.conflict.set(true);
      } else {
        this.errorMsg.set('Could not save your changes.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async reloadFromServer(): Promise<void> {
    const slug = this.currentSlug();
    this.editing.set(false);
    this.conflict.set(false);
    if (slug) await this.loadPage(slug);
  }

  async toggleVisibility(): Promise<void> {
    const p = this.page();
    if (!p || !this.isDm) return;
    const next = p.visibility === 'dm_only' ? 'shared' : 'dm_only';
    try {
      const res = await this.wiki.update(p.id, { visibility: next });
      this.page.set(res.page);
      await this.loadTree();
    } catch {
      this.errorMsg.set('Could not change visibility.');
    }
  }

  async deletePage(): Promise<void> {
    const p = this.page();
    if (!p) return;
    const ok = await this.confirm.confirm(
      `Delete "${p.title}"? Links to it elsewhere will turn red. This cannot be undone.`,
      'Delete Page',
    );
    if (!ok) return;
    await this.wiki.remove(p.id);
    await this.loadTree();
    void this.router.navigate(this.wikiBase);
  }

  // ── search ─────────────────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    if (!value.trim()) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(() => void this.runSearch(value), 250);
  }

  private async runSearch(value: string): Promise<void> {
    try {
      this.searchResults.set(await this.wiki.search(this.campaignId, value));
    } finally {
      this.searching.set(false);
    }
  }

  clearSearch(): void {
    this.q.set('');
    this.searchResults.set([]);
  }

  folderLabel(folder: string): string {
    return folder || 'General';
  }
}
