import MarkdownIt from 'markdown-it';
import type { RendererRule, StateInline } from 'markdown-it';
import DOMPurify from 'dompurify';

/** Must match the backend's slugify (wikilink.util.ts) so link resolution agrees. */
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

interface WikiLinkMeta {
  target: string;
  slug: string;
  heading: string;
  label: string;
}

// Inline rule for `[[Target#heading|alias]]`. Emits an <a class="wiki-link"> carrying the
// resolved slug in data-* attributes; the host component decides (against its page list)
// whether the link is live or a red "create me" link and wires navigation.
function wikiLinkPlugin(md: InstanceType<typeof MarkdownIt>): void {
  md.inline.ruler.before('link', 'wikilink', (state: StateInline, silent: boolean) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b)
      return false;
    const end = src.indexOf(']]', start + 2);
    if (end < 0) return false;
    const inner = src.slice(start + 2, end);
    if (!inner.trim() || inner.includes('[') || inner.includes('\n')) return false;

    if (!silent) {
      const pipe = inner.indexOf('|');
      const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
      const beforeAlias = pipe >= 0 ? inner.slice(0, pipe) : inner;
      const hash = beforeAlias.indexOf('#');
      const target = (hash >= 0 ? beforeAlias.slice(0, hash) : beforeAlias).trim();
      const heading = hash >= 0 ? beforeAlias.slice(hash + 1).trim() : '';
      if (!target && !heading) return false;

      const meta: WikiLinkMeta = {
        target,
        slug: slugify(target),
        heading,
        label: alias || (heading && !target ? heading : target) || heading,
      };
      const token = state.push('wikilink', '', 0);
      token.meta = meta as unknown as Record<string, unknown>;
      token.content = meta.label;
    }
    state.pos = end + 2;
    return true;
  });

  const renderWikiLink: RendererRule = (tokens, idx) => {
    const meta = tokens[idx].meta as unknown as WikiLinkMeta;
    const esc = md.utils.escapeHtml;
    const attrs =
      `class="wiki-link" data-slug="${esc(meta.slug)}"` +
      ` data-title="${esc(meta.target)}"` +
      (meta.heading ? ` data-heading="${esc(meta.heading)}"` : '');
    return `<a ${attrs} href="#">${esc(tokens[idx].content)}</a>`;
  };
  md.renderer.rules['wikilink'] = renderWikiLink;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: true,
}).use(wikiLinkPlugin);

// External links open in a new tab; internal wiki links are left for the host to handle.
const defaultLinkOpen: RendererRule =
  md.renderer.rules['link_open'] ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet('href') ?? '');
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderWikiMarkdown(body: string): string {
  return DOMPurify.sanitize(md.render(body ?? ''), {
    ADD_ATTR: ['target', 'data-slug', 'data-title', 'data-heading'],
  });
}
