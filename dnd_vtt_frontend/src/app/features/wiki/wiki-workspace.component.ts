import {
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { WikiLiveEditorComponent } from './wiki-live-editor.component';
import {
  FolderNode,
  buildTree,
  firstPageSlug,
  folderPaths,
  joinFolder,
  parentFolder,
} from './wiki-tree';
import { slugify } from './wiki-slug';

type ContextMenu =
  | { kind: 'folder'; path: string; x: number; y: number }
  | { kind: 'page'; page: WikiPageSummary; x: number; y: number };

/** An item currently being dragged in the sidebar tree. */
type DragItem =
  | { kind: 'page'; page: WikiPageSummary; from: string }
  | { kind: 'folder'; path: string };

const SAVE_DEBOUNCE_MS = 1500;

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 520;
const DEFAULT_SIDEBAR = 256;
const SIDEBAR_WIDTH_KEY = 'wiki:sidebar:width';

function loadSidebarWidth(): number {
  try {
    const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return n >= MIN_SIDEBAR && n <= MAX_SIDEBAR ? n : DEFAULT_SIDEBAR;
  } catch {
    return DEFAULT_SIDEBAR;
  }
}

function persistSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
  } catch {
    /* ignore */
  }
}

// The routing-free wiki. `WikiComponent` wraps this for the full-page route (syncing `slug` <-> the
// URL); `WikiEmbedComponent` renders it inside the campaign/session hubs with `embedded` set, which
// adds a Read/Edit toggle and collapses the sidebar + editor chrome in read mode.
@Component({
  selector: 'app-wiki-workspace',
  imports: [
    NgClass,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatTooltipModule,
    WikiLiveEditorComponent,
  ],
  templateUrl: './wiki-workspace.component.html',
  styleUrl: './wiki-workspace.component.scss',
  host: {
    class: 'flex',
    '[class.flex-1]': '!embedded()',
    '[class.min-h-0]': '!embedded()',
    '[class.overflow-hidden]': '!embedded()',
    '[class.wiki-embedded]': 'embedded()',
  },
})
export class WikiWorkspaceComponent implements OnInit {
  private wiki = inject(WikiService);
  private confirm = inject(ConfirmService);

  readonly campaignId = input.required<string>();
  readonly isDm = input(false);
  readonly slug = input<string | null>(null);
  readonly embedded = input(false);
  /** Ordered display names (e.g. the session name, then the campaign name) whose matching page an
   *  embedded hub should land on by default, in place of the first page in the tree. A page the
   *  viewer opened themselves — or one restored from the embed's last-viewed memory — still wins. */
  readonly preferredTitles = input<string[]>([]);

  readonly slugChange = output<string | null>();

  readonly currentSlug = computed(() => this.slug());

  /** In an embedded host, whether the compact read-only view (vs. the full editing UI) is showing. */
  mode = signal<'read' | 'edit'>('read');
  readonly readingOnly = computed(() => this.embedded() && this.mode() === 'read');

  tree = signal<WikiPageSummary[]>([]);
  page = signal<WikiPage | null>(null);
  backlinks = signal<WikiBacklink[]>([]);
  loadingTree = signal(true);
  loadingPage = signal(false);
  notFound = signal(false);

  draftTitle = signal('');
  draftBody = signal('');
  saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  conflict = signal(false);
  errorMsg = signal<string | null>(null);

  /** Client-only folders created via "New folder" that hold no page yet. */
  draftFolders = signal<string[]>([]);
  collapsed = signal<Set<string>>(new Set());
  menu = signal<ContextMenu | null>(null);

  /** Sidebar width in px; drag the divider on its right edge to resize. */
  sidebarWidth = signal(loadSidebarWidth());

  /** Sidebar drag & drop: the item being dragged, and the folder path hovered as a drop target
   *  ('' = wiki root, null = nothing hovered). */
  dragItem = signal<DragItem | null>(null);
  dropTarget = signal<string | null>(null);

  q = signal('');
  searchResults = signal<WikiSearchHit[]>([]);
  searching = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;

  /** The slug this component last auto-selected for the embedded panel (first-page fallback or a
   *  `preferredTitles` match). Cleared the moment the viewer navigates, so a late-arriving
   *  `preferredTitles` (parent hub still resolving its campaign/session) can still upgrade the
   *  pick while a real choice is never yanked away. */
  private autoSlug: string | null = null;

  readonly slugSet = computed(() => new Set(this.tree().map((p) => p.slug)));
  readonly editorPages = computed(() =>
    this.tree().map((p) => ({ title: p.title, slug: p.slug })),
  );

  readonly rootNode = computed<FolderNode>(() =>
    buildTree(this.tree(), this.draftFolders()),
  );

  readonly canEditCurrent = computed(() => {
    const p = this.page();
    if (!p) return false;
    return this.isDm() || p.visibility === 'shared';
  });

  /** In an embedded hub's read view, suppress the page heading when the current page is the one
   *  named after the campaign/session (the default landing page) — the hub already shows that
   *  name above the panel, so repeating it as an <h1> is just noise. Only applies in read mode;
   *  the editable title input always shows. */
  readonly hideTitle = computed(() => {
    if (!this.readingOnly()) return false;
    const p = this.page();
    if (!p) return false;
    const want = slugify(p.title);
    return (
      !!want &&
      this.preferredTitles().some((t) => slugify(t ?? '') === want)
    );
  });

  readonly dirty = computed(() => {
    const p = this.page();
    if (!p) return false;
    return this.draftBody() !== p.body || this.draftTitle().trim() !== p.title;
  });

  constructor() {
    effect(() => {
      const slug = this.currentSlug();
      // Only `slug` should retrigger this; flushSave/loadPage read other signals synchronously.
      untracked(() => {
        this.conflict.set(false);
        clearTimeout(this.saveTimer);
        void (async () => {
          await this.flushSave();
          if (slug) await this.loadPage(slug);
          else {
            this.page.set(null);
            this.backlinks.set([]);
            this.notFound.set(false);
          }
        })();
      });
    });

    // The parent hub loads its campaign/session name asynchronously, so `preferredTitles` often
    // arrives after the first `loadTree()`. Re-run the default pick when it (or the tree) changes,
    // but only while the panel is still showing a page we auto-selected — never over the viewer's
    // own navigation or a slug restored from the embed's last-viewed memory.
    effect(() => {
      const titles = this.preferredTitles();
      const rows = this.tree();
      untracked(() => {
        if (!this.embedded() || this.loadingTree() || !titles.length) return;
        const cur = this.currentSlug();
        if (cur && cur !== this.autoSlug) return;
        const want = this.defaultEmbeddedSlug(rows);
        if (want && want !== cur) {
          this.autoSlug = want;
          this.slugChange.emit(want);
        }
      });
    });
  }

  ngOnInit(): void {
    this.collapsed.set(this.loadCollapsed());
    void this.loadTree();
  }

  setMode(mode: 'read' | 'edit'): void {
    this.mode.set(mode);
  }

  // ── loading ────────────────────────────────────────────────────────────────

  private async loadTree(): Promise<void> {
    this.loadingTree.set(true);
    try {
      const rows = await this.wiki.tree(this.campaignId());
      this.tree.set(rows);
      // Drop draft folders that a real page now occupies.
      const real = new Set(folderPaths(rows));
      this.draftFolders.update((d) => d.filter((p) => !real.has(p)));
      // Embedded (hub) view: with no valid page selected, land on the first one so the panel
      // isn't just an empty state.
      if (this.embedded()) {
        const cur = this.currentSlug();
        if (!cur || !rows.some((r) => r.slug === cur)) {
          const want = this.defaultEmbeddedSlug(rows);
          this.autoSlug = want;
          this.slugChange.emit(want);
        }
      }
    } finally {
      this.loadingTree.set(false);
    }
  }

  private async loadPage(slug: string): Promise<void> {
    this.loadingPage.set(true);
    this.notFound.set(false);
    try {
      const res = await this.wiki.page(this.campaignId(), slug);
      this.page.set(res.page);
      this.backlinks.set(res.backlinks);
      this.draftTitle.set(res.page.title);
      this.draftBody.set(res.page.body);
      this.saveState.set('idle');
      this.expandTo(res.page.folder);
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
    this.autoSlug = null;
    this.slugChange.emit(slug);
  }

  /** Which page an embedded hub opens by default: the first `preferredTitles` entry that matches a
   *  page (by slug, or by title for a renamed page whose slug drifted to `name-2`), else the first
   *  page in the tree — the original fallback. */
  private defaultEmbeddedSlug(rows: WikiPageSummary[]): string | null {
    for (const title of this.preferredTitles()) {
      const want = slugify(title ?? '');
      if (!want) continue;
      const hit =
        rows.find((r) => r.slug === want) ??
        rows.find((r) => slugify(r.title) === want);
      if (hit) return hit.slug;
    }
    return firstPageSlug(this.rootNode());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menu.set(null);
  }

  @HostListener('window:beforeunload')
  onUnload(): void {
    if (this.dirty()) void this.flushSave();
  }

  onEditorLink(e: { slug: string; title: string }): void {
    if (this.slugSet().has(e.slug)) this.openPage(e.slug);
    else void this.createPage(e.title);
  }

  // ── editing / autosave ─────────────────────────────────────────────────────

  onBodyChange(body: string): void {
    this.draftBody.set(body);
    this.queueSave();
  }

  onTitleChange(title: string): void {
    this.draftTitle.set(title);
    this.queueSave();
  }

  private queueSave(): void {
    if (!this.canEditCurrent()) return;
    this.saveState.set('idle');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  async flushSave(force = false): Promise<void> {
    clearTimeout(this.saveTimer);
    const p = this.page();
    if (!p || !this.canEditCurrent() || (!this.dirty() && !force)) return;

    this.saveState.set('saving');
    this.errorMsg.set(null);
    try {
      const res = await this.wiki.update(p.id, {
        title: this.draftTitle().trim() || p.title,
        body: this.draftBody(),
        expectedUpdatedAt: force ? undefined : p.updated_at,
      });
      this.page.set(res.page);
      this.backlinks.set(res.backlinks);
      this.conflict.set(false);
      this.saveState.set('saved');
      setTimeout(() => this.saveState.update((s) => (s === 'saved' ? 'idle' : s)), 2000);
      await this.loadTree();
      if (res.page.slug !== p.slug) this.openPage(res.page.slug);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.conflict.set(true);
      } else {
        this.errorMsg.set('Could not save your changes.');
      }
      this.saveState.set('error');
    }
  }

  async reloadFromServer(): Promise<void> {
    const slug = this.currentSlug();
    this.conflict.set(false);
    if (slug) await this.loadPage(slug);
  }

  // ── page mutations ─────────────────────────────────────────────────────────

  async createPage(title?: string, folder = ''): Promise<void> {
    const name = (title ?? window.prompt('New page title')?.trim() ?? '').trim();
    if (!name) return;
    this.errorMsg.set(null);
    try {
      const res = await this.wiki.create({
        campaignId: this.campaignId(),
        title: name,
        folder: folder || this.page()?.folder || '',
      });
      await this.loadTree();
      this.openPage(res.page.slug);
    } catch {
      this.errorMsg.set('Could not create the page.');
    }
  }

  async renamePage(page: WikiPageSummary): Promise<void> {
    const name = window.prompt('Rename page', page.title)?.trim();
    if (!name || name === page.title) return;
    const res = await this.wiki.update(page.id, { title: name });
    await this.loadTree();
    if (this.page()?.id === page.id) {
      this.page.set(res.page);
      this.draftTitle.set(res.page.title);
      if (res.page.slug !== page.slug) this.openPage(res.page.slug);
    }
  }

  async movePage(page: WikiPageSummary): Promise<void> {
    const folder = window.prompt('Move to folder (blank = wiki root)', page.folder);
    if (folder === null || folder === page.folder) return;
    await this.wiki.update(page.id, { folder });
    await this.loadTree();
    if (this.page()?.id === page.id) await this.loadPage(page.slug);
  }

  async toggleVisibility(): Promise<void> {
    const p = this.page();
    if (!p || !this.isDm()) return;
    const next = p.visibility === 'dm_only' ? 'shared' : 'dm_only';
    try {
      const res = await this.wiki.update(p.id, { visibility: next });
      this.page.set(res.page);
      await this.loadTree();
    } catch {
      this.errorMsg.set('Could not change visibility.');
    }
  }

  async deletePage(page?: WikiPageSummary): Promise<void> {
    const target = page ?? this.page();
    if (!target) return;
    const ok = await this.confirm.confirm(
      `Delete "${target.title}"? Links to it elsewhere will turn red. This cannot be undone.`,
      'Delete Page',
    );
    if (!ok) return;
    await this.wiki.remove(target.id);
    await this.loadTree();
    if (!page || this.page()?.id === target.id) this.slugChange.emit(null);
  }

  // ── folder mutations (display-only; folders live in page.folder paths) ──────

  newFolder(parent = ''): void {
    const name = window.prompt('New folder name')?.trim();
    if (!name) return;
    const clean = name.replace(/\//g, ' ').trim();
    if (!clean) return;
    const path = parent ? `${parent}/${clean}` : clean;
    this.draftFolders.update((d) => (d.includes(path) ? d : [...d, path]));
    this.expandTo(path);
  }

  async renameFolder(path: string): Promise<void> {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const current = path.slice(path.lastIndexOf('/') + 1);
    const name = window.prompt('Rename folder', current)?.trim().replace(/\//g, ' ').trim();
    if (!name || name === current) return;
    const next = parent ? `${parent}/${name}` : name;

    const affected = this.tree().filter(
      (p) => p.folder === path || p.folder.startsWith(`${path}/`),
    );
    await Promise.all(
      affected.map((p) =>
        this.wiki.update(p.id, { folder: next + p.folder.slice(path.length) }),
      ),
    );
    this.draftFolders.update((d) =>
      d.map((f) => (f === path || f.startsWith(`${path}/`) ? next + f.slice(path.length) : f)),
    );
    await this.loadTree();
    if (this.page()) await this.loadPage(this.page()!.slug);
  }

  async deleteFolder(path: string): Promise<void> {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const affected = this.tree().filter(
      (p) => p.folder === path || p.folder.startsWith(`${path}/`),
    );
    const ok = await this.confirm.confirm(
      affected.length
        ? `Delete folder "${path}"? Its ${affected.length} page(s) move to ${parent || 'the wiki root'}.`
        : `Delete empty folder "${path}"?`,
      'Delete Folder',
    );
    if (!ok) return;
    await Promise.all(
      affected.map((p) =>
        this.wiki.update(p.id, { folder: joinFolder(parent, p.folder.slice(path.length)) }),
      ),
    );
    this.draftFolders.update((d) =>
      d.filter((f) => f !== path && !f.startsWith(`${path}/`)),
    );
    await this.loadTree();
    if (this.page()) await this.loadPage(this.page()!.slug);
  }

  // ── drag & drop (sidebar tree) ─────────────────────────────────────────────

  /** Whether `item` may legally be dropped into the folder at `target` ('' = wiki root). */
  private isLegalDrop(item: DragItem, target: string): boolean {
    if (item.kind === 'page') return item.from !== target;
    // A folder can't be dropped onto itself, into one of its own descendants, or back
    // into the parent it already lives in.
    if (target === item.path || target.startsWith(`${item.path}/`)) return false;
    return parentFolder(item.path) !== target;
  }

  draggingPage(id: string): boolean {
    const d = this.dragItem();
    return d?.kind === 'page' && d.page.id === id;
  }

  draggingFolder(path: string): boolean {
    const d = this.dragItem();
    return d?.kind === 'folder' && d.path === path;
  }

  startDragPage(ev: DragEvent, page: WikiPageSummary): void {
    this.beginDrag(ev, { kind: 'page', page, from: page.folder }, page.slug);
  }

  startDragFolder(ev: DragEvent, path: string): void {
    this.beginDrag(ev, { kind: 'folder', path }, path);
  }

  private beginDrag(ev: DragEvent, item: DragItem, label: string): void {
    this.dragItem.set(item);
    this.menu.set(null);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', label);
    }
  }

  onDragOver(ev: DragEvent, target: string): void {
    ev.stopPropagation();
    const d = this.dragItem();
    if (!d || !this.isLegalDrop(d, target)) {
      this.dropTarget.set(null);
      return;
    }
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.dropTarget.set(target);
  }

  onDragLeave(target: string): void {
    if (this.dropTarget() === target) this.dropTarget.set(null);
  }

  onDragEnd(): void {
    this.dragItem.set(null);
    this.dropTarget.set(null);
  }

  async onDrop(ev: DragEvent, target: string): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    const d = this.dragItem();
    this.dragItem.set(null);
    this.dropTarget.set(null);
    if (!d || !this.isLegalDrop(d, target)) return;
    try {
      if (d.kind === 'page') await this.movePageInto(d.page, target);
      else await this.moveFolderInto(d.path, target);
    } catch {
      this.errorMsg.set('Could not move that item.');
    }
  }

  private async movePageInto(page: WikiPageSummary, folder: string): Promise<void> {
    if (folder === page.folder) return;
    await this.wiki.update(page.id, { folder });
    if (folder) this.expandTo(folder);
    await this.loadTree();
    if (this.page()?.id === page.id) await this.loadPage(page.slug);
  }

  /** Move a folder (and every page/subfolder under it) into `destParent` ('' = wiki root). */
  private async moveFolderInto(srcPath: string, destParent: string): Promise<void> {
    const base = srcPath.slice(srcPath.lastIndexOf('/') + 1);
    const next = destParent ? `${destParent}/${base}` : base;
    if (next === srcPath) return;

    const affected = this.tree().filter(
      (p) => p.folder === srcPath || p.folder.startsWith(`${srcPath}/`),
    );
    await Promise.all(
      affected.map((p) =>
        this.wiki.update(p.id, { folder: next + p.folder.slice(srcPath.length) }),
      ),
    );
    this.draftFolders.update((d) =>
      d.map((f) =>
        f === srcPath || f.startsWith(`${srcPath}/`) ? next + f.slice(srcPath.length) : f,
      ),
    );
    this.expandTo(next);
    await this.loadTree();
    if (this.page()) await this.loadPage(this.page()!.slug);
  }

  // ── sidebar resize ─────────────────────────────────────────────────────────

  startResize(ev: PointerEvent): void {
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = this.sidebarWidth();
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (e: PointerEvent) => {
      this.sidebarWidth.set(
        Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startW + (e.clientX - startX))),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      persistSidebarWidth(this.sidebarWidth());
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── sidebar tree state ─────────────────────────────────────────────────────

  isExpanded(path: string): boolean {
    return !this.collapsed().has(path);
  }

  toggleFolder(path: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      this.persistCollapsed(next);
      return next;
    });
  }

  private expandTo(folder: string): void {
    if (!folder) return;
    const parts = folder.split('/');
    this.collapsed.update((set) => {
      const next = new Set(set);
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        next.delete(acc);
      }
      this.persistCollapsed(next);
      return next;
    });
  }

  // ── context menu ───────────────────────────────────────────────────────────

  openFolderMenu(ev: MouseEvent, path: string): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menu.set({ kind: 'folder', path, x: ev.clientX, y: ev.clientY });
  }

  openPageMenu(ev: MouseEvent, page: WikiPageSummary): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menu.set({ kind: 'page', page, x: ev.clientX, y: ev.clientY });
  }

  closeMenu(): void {
    this.menu.set(null);
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
      this.searchResults.set(await this.wiki.search(this.campaignId(), value));
    } finally {
      this.searching.set(false);
    }
  }

  clearSearch(): void {
    this.q.set('');
    this.searchResults.set([]);
  }

  // ── persistence helpers ────────────────────────────────────────────────────

  private loadCollapsed(): Set<string> {
    try {
      const raw = localStorage.getItem(`wiki:collapsed:${this.campaignId()}`);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private persistCollapsed(set: Set<string>): void {
    try {
      localStorage.setItem(
        `wiki:collapsed:${this.campaignId()}`,
        JSON.stringify([...set]),
      );
    } catch {
      /* ignore */
    }
  }
}
