import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateWikiPageDto } from './dto/create-wiki-page.dto';
import { UpdateWikiPageDto } from './dto/update-wiki-page.dto';
import { rewriteWikiLinks, slugify, wikiLinkSlugs } from './wikilink.util';
import type { RequestUser } from '../common/current-user.decorator';

interface Batch {
  sql: string;
  args?: unknown[];
}

@Injectable()
export class WikiService {
  constructor(private db: DatabaseService) {}

  // ── reads ──────────────────────────────────────────────────────────────────

  async tree(campaignId: string, user: RequestUser) {
    const { isDm } = await this.assertAccess(campaignId, user);
    const result = await this.db.execute(
      `SELECT p.id, p.title, p.slug, p.folder, p.visibility, p.updated_at,
              e.username AS updated_by_name
         FROM wiki_pages p
         LEFT JOIN profiles e ON e.id = p.updated_by
        WHERE p.campaign_id = ?${isDm ? '' : ` AND p.visibility = 'shared'`}
        ORDER BY p.folder COLLATE NOCASE, p.title COLLATE NOCASE`,
      [campaignId],
    );
    return result.rows;
  }

  async getPage(campaignId: string, slug: string, user: RequestUser) {
    const { isDm } = await this.assertAccess(campaignId, user);
    const result = await this.db.execute(
      `SELECT p.*, a.username AS author_name, e.username AS updated_by_name
         FROM wiki_pages p
         JOIN profiles a ON a.id = p.author_id
         LEFT JOIN profiles e ON e.id = p.updated_by
        WHERE p.campaign_id = ? AND p.slug = ?`,
      [campaignId, slug],
    );
    const page = result.rows[0];
    // 404 rather than 403 for dm_only pages so their existence doesn't leak to players.
    if (!page || (page.visibility === 'dm_only' && !isDm))
      throw new NotFoundException('Wiki page not found');

    const backlinks = await this.db.execute(
      `SELECT s.id, s.title, s.slug, s.folder
         FROM wiki_page_links l
         JOIN wiki_pages s ON s.id = l.source_page_id
        WHERE l.target_page_id = ?${isDm ? '' : ` AND s.visibility = 'shared'`}
        ORDER BY s.title COLLATE NOCASE`,
      [page.id],
    );

    return { page, backlinks: backlinks.rows };
  }

  async search(campaignId: string, user: RequestUser, q: string) {
    const { isDm } = await this.assertAccess(campaignId, user);
    const match = toFtsQuery(q);
    if (!match) return [];
    const result = await this.db.execute(
      `SELECT p.id, p.title, p.slug, p.folder,
              snippet(wiki_pages_fts, 3, '[', ']', '…', 12) AS snippet
         FROM wiki_pages_fts f
         JOIN wiki_pages p ON p.id = f.page_id
        WHERE f.campaign_id = ? AND wiki_pages_fts MATCH ?
          ${isDm ? '' : ` AND p.visibility = 'shared'`}
        ORDER BY rank
        LIMIT 30`,
      [campaignId, match],
    );
    return result.rows;
  }

  async graph(campaignId: string, user: RequestUser) {
    const { isDm } = await this.assertAccess(campaignId, user);
    const vis = isDm ? '' : ` AND visibility = 'shared'`;
    const nodes = await this.db.execute(
      `SELECT id, title, slug, folder FROM wiki_pages WHERE campaign_id = ?${vis}`,
      [campaignId],
    );
    const edges = await this.db.execute(
      `SELECT DISTINCT l.source_page_id AS source, l.target_page_id AS target
         FROM wiki_page_links l
         JOIN wiki_pages s ON s.id = l.source_page_id
         JOIN wiki_pages t ON t.id = l.target_page_id
        WHERE s.campaign_id = ? AND l.target_page_id IS NOT NULL
          ${isDm ? '' : ` AND s.visibility = 'shared' AND t.visibility = 'shared'`}`,
      [campaignId],
    );
    return { nodes: nodes.rows, edges: edges.rows };
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  async create(user: RequestUser, dto: CreateWikiPageDto) {
    const { isDm } = await this.assertAccess(dto.campaignId, user);

    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    const visibility =
      dto.visibility === 'dm_only' && isDm ? 'dm_only' : 'shared';
    const folder = normalizeFolder(dto.folder ?? '');
    const body = dto.body ?? '';
    const slug = await this.uniqueSlug(
      dto.campaignId,
      slugify(title) || 'untitled',
    );
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmts: Batch[] = [
      {
        sql: `INSERT INTO wiki_pages
                (id, campaign_id, title, slug, folder, body, visibility, author_id, updated_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          dto.campaignId,
          title,
          slug,
          folder,
          body,
          visibility,
          user.id,
          user.id,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO wiki_page_versions (id, page_id, title, folder, body, editor_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), id, title, folder, body, user.id, now],
      },
      ...this.reindexStmts(id, dto.campaignId, title, body),
      this.resolveLinksStmt(dto.campaignId),
    ];
    await this.db.executeMany(stmts);

    return this.getPage(dto.campaignId, slug, user);
  }

  async update(id: string, user: RequestUser, dto: UpdateWikiPageDto) {
    const existing = await this.db.execute(
      `SELECT * FROM wiki_pages WHERE id = ?`,
      [id],
    );
    const page = existing.rows[0];
    if (!page) throw new NotFoundException('Wiki page not found');

    const campaignId = page.campaign_id as string;
    const { isDm } = await this.assertAccess(campaignId, user);
    // DM edits anything; players may edit shared pages but never touch dm_only ones.
    if (page.visibility === 'dm_only' && !isDm) throw new ForbiddenException();
    if (
      dto.expectedUpdatedAt &&
      dto.expectedUpdatedAt !== (page.updated_at as string)
    )
      throw new ConflictException(
        'This page was changed by someone else since you started editing.',
      );

    const oldTitle = page.title as string;
    const title = dto.title?.trim() || oldTitle;
    const renamed = title.toLowerCase() !== oldTitle.toLowerCase();
    const slug = renamed
      ? await this.uniqueSlug(campaignId, slugify(title) || 'untitled', id)
      : (page.slug as string);
    const folder =
      dto.folder !== undefined
        ? normalizeFolder(dto.folder)
        : (page.folder as string);
    const body = dto.body !== undefined ? dto.body : (page.body as string);
    // Only the DM can move a page in or out of dm_only visibility.
    const visibility = isDm
      ? (dto.visibility ?? (page.visibility as string))
      : (page.visibility as string);
    const now = new Date().toISOString();

    const stmts: Batch[] = [
      {
        sql: `INSERT INTO wiki_page_versions (id, page_id, title, folder, body, editor_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), id, title, folder, body, user.id, now],
      },
      {
        sql: `UPDATE wiki_pages
                 SET title = ?, slug = ?, folder = ?, body = ?, visibility = ?, updated_by = ?, updated_at = ?
               WHERE id = ?`,
        args: [title, slug, folder, body, visibility, user.id, now, id],
      },
      ...this.reindexStmts(id, campaignId, title, body),
    ];

    if (renamed) {
      // Obsidian-style: rewrite every `[[Old Title]]` in other pages to the new title so the
      // links (and their backlinks) survive the rename instead of going red.
      const others = await this.db.execute(
        `SELECT id, title, body FROM wiki_pages
          WHERE campaign_id = ? AND id != ? AND body LIKE '%[[%'`,
        [campaignId, id],
      );
      for (const o of others.rows) {
        const newBody = rewriteWikiLinks(o.body as string, oldTitle, title);
        if (newBody === o.body) continue;
        stmts.push(
          {
            sql: `INSERT INTO wiki_page_versions (id, page_id, title, folder, body, editor_id, created_at)
                  VALUES (?, ?, (SELECT title FROM wiki_pages WHERE id = ?), (SELECT folder FROM wiki_pages WHERE id = ?), ?, ?, ?)`,
            args: [randomUUID(), o.id, o.id, o.id, newBody, user.id, now],
          },
          {
            sql: `UPDATE wiki_pages SET body = ?, updated_at = ? WHERE id = ?`,
            args: [newBody, now, o.id],
          },
          ...this.reindexStmts(
            o.id as string,
            campaignId,
            o.title as string,
            newBody,
          ),
        );
      }
    }

    stmts.push(this.resolveLinksStmt(campaignId));
    await this.db.executeMany(stmts);

    return this.getPage(campaignId, slug, user);
  }

  async remove(id: string, user: RequestUser) {
    const result = await this.db.execute(
      `SELECT * FROM wiki_pages WHERE id = ?`,
      [id],
    );
    const page = result.rows[0];
    if (!page) throw new NotFoundException('Wiki page not found');

    const { isDm } = await this.assertAccess(page.campaign_id as string, user);
    if (!isDm && page.author_id !== user.id) throw new ForbiddenException();

    // Inbound links drop to unresolved automatically (wiki_page_links.target_page_id
    // ON DELETE SET NULL); the FTS mirror table has no FK, so clear it by hand.
    await this.db.executeMany([
      { sql: `DELETE FROM wiki_pages_fts WHERE page_id = ?`, args: [id] },
      { sql: `DELETE FROM wiki_pages WHERE id = ?`, args: [id] },
    ]);
    return { deleted: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** DELETE + rebuild this page's outgoing link rows and its FTS row. */
  private reindexStmts(
    pageId: string,
    campaignId: string,
    title: string,
    body: string,
  ): Batch[] {
    const stmts: Batch[] = [
      {
        sql: `DELETE FROM wiki_page_links WHERE source_page_id = ?`,
        args: [pageId],
      },
      { sql: `DELETE FROM wiki_pages_fts WHERE page_id = ?`, args: [pageId] },
      {
        sql: `INSERT INTO wiki_pages_fts (page_id, campaign_id, title, body) VALUES (?, ?, ?, ?)`,
        args: [pageId, campaignId, title, body],
      },
    ];
    for (const slug of wikiLinkSlugs(body)) {
      stmts.push({
        sql: `INSERT INTO wiki_page_links (source_page_id, target_slug, target_page_id) VALUES (?, ?, NULL)`,
        args: [pageId, slug],
      });
    }
    return stmts;
  }

  /**
   * Re-point every link row in the campaign at whatever page currently owns its `target_slug`
   * (NULL when none does). One statement covers new pages, deletes, and renames at once.
   */
  private resolveLinksStmt(campaignId: string): Batch {
    return {
      sql: `UPDATE wiki_page_links
               SET target_page_id = (
                 SELECT p.id FROM wiki_pages p
                  WHERE p.campaign_id = ? AND p.slug = wiki_page_links.target_slug
               )
             WHERE source_page_id IN (SELECT id FROM wiki_pages WHERE campaign_id = ?)`,
      args: [campaignId, campaignId],
    };
  }

  private async uniqueSlug(
    campaignId: string,
    base: string,
    exceptId?: string,
  ): Promise<string> {
    let slug = base;
    let n = 2;
    // Campaign wikis are small; a handful of probes at worst.
    while (true) {
      const clash = await this.db.execute(
        `SELECT 1 FROM wiki_pages WHERE campaign_id = ? AND slug = ?${
          exceptId ? ' AND id != ?' : ''
        }`,
        exceptId ? [campaignId, slug, exceptId] : [campaignId, slug],
      );
      if (clash.rows.length === 0) return slug;
      slug = `${base}-${n++}`;
    }
  }

  // Owner-or-active-member gate, mirroring NotesService.assertAccess but campaign-scoped only.
  private async assertAccess(
    campaignId: string,
    user: RequestUser,
  ): Promise<{ isDm: boolean }> {
    const result = await this.db.execute(
      `SELECT dm_id FROM campaigns WHERE id = ?`,
      [campaignId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Campaign not found');
    if (user.id === row.dm_id) return { isDm: true };

    const membership = await this.db.execute(
      `SELECT 1 FROM campaign_members
        WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, user.id],
    );
    if (membership.rows.length === 0) throw new ForbiddenException();
    return { isDm: false };
  }
}

/** Collapse `/foo//bar/` to `foo/bar`; empty means the wiki root. */
function normalizeFolder(input: string): string {
  return input
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

/**
 * Turn a free-text query into a safe FTS5 MATCH string: each alphanumeric token quoted, the
 * last one given a `*` for prefix search. Returns '' when nothing usable is left.
 */
function toFtsQuery(q: string): string {
  const tokens = (q || '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
  if (!tokens.length) return '';
  return tokens
    .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(' ');
}
