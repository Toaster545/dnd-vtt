// Parsing helpers for `[[wikilinks]]`, shared by WikiService for link indexing and rename
// rewrites. Mirrors Obsidian's syntax: `[[Page]]`, `[[Page|display text]]`, `[[Page#Heading]]`,
// and any combination. Links are matched as plain text in the markdown body — resolution to a
// real page happens later by comparing `slug` values.

export interface ParsedWikiLink {
  /** The full matched token including brackets, e.g. `[[Old Name|see here]]`. */
  raw: string;
  /** Page name portion, trimmed, before any `#` or `|` — e.g. `Old Name`. */
  target: string;
  /** Slugified `target`, used to resolve against `wiki_pages.slug`. */
  slug: string;
  /** Heading fragment after `#`, if present (not slugified). */
  heading?: string;
  /** Display-text override after `|`, if present. */
  alias?: string;
}

const WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

/** Lowercase, spaces-to-dashes, strip anything but `[a-z0-9-]`, collapse and trim dashes. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseWikiLinks(body: string): ParsedWikiLink[] {
  const out: ParsedWikiLink[] = [];
  for (const match of body.matchAll(WIKILINK_RE)) {
    const inner = match[1];
    const [beforeAlias, ...aliasParts] = inner.split('|');
    const alias = aliasParts.length ? aliasParts.join('|').trim() : undefined;
    const [name, ...headingParts] = beforeAlias.split('#');
    const target = name.trim();
    if (!target) continue;
    out.push({
      raw: match[0],
      target,
      slug: slugify(target),
      heading: headingParts.length ? headingParts.join('#').trim() : undefined,
      alias,
    });
  }
  return out;
}

/** Distinct resolved slugs referenced by a body, in first-seen order. */
export function wikiLinkSlugs(body: string): string[] {
  const seen = new Set<string>();
  for (const link of parseWikiLinks(body)) {
    if (link.slug) seen.add(link.slug);
  }
  return [...seen];
}

/**
 * Rewrite every `[[oldTitle ...]]` occurrence so it points at `newTitle`, preserving any
 * `#heading` and `|alias` suffix. Matching on the page-name portion is case-insensitive and
 * also tolerant of the slugified form, so `[[old-name]]` is caught alongside `[[Old Name]]`.
 */
export function rewriteWikiLinks(
  body: string,
  oldTitle: string,
  newTitle: string,
): string {
  const oldSlug = slugify(oldTitle);
  return body.replace(WIKILINK_RE, (whole, inner: string) => {
    const [beforeAlias, ...aliasParts] = inner.split('|');
    const [name, ...headingParts] = beforeAlias.split('#');
    const trimmed = name.trim();
    const matches =
      trimmed.toLowerCase() === oldTitle.toLowerCase() ||
      slugify(trimmed) === oldSlug;
    if (!matches) return whole;
    const heading = headingParts.length ? `#${headingParts.join('#')}` : '';
    const alias = aliasParts.length ? `|${aliasParts.join('|')}` : '';
    return `[[${newTitle}${heading}${alias}]]`;
  });
}
