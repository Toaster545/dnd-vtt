import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { EditorState, Range, StateEffect, StateField } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { slugify } from './wiki-slug';

// A CodeMirror 6 "Live Preview" layer for the wiki editor: it renders common Markdown inline as
// you type and only falls back to raw syntax on the line (or inside the node) the caret is in —
// the Obsidian editing experience. Everything here is decoration-only; the document text is
// always plain Markdown.

export interface LivePreviewHandlers {
  openLink: (slug: string, title: string) => void;
  createLink: (title: string) => void;
}

/** The set of page slugs that currently exist, so `[[links]]` can be shown live vs. "missing". */
export const setKnownSlugs = StateEffect.define<Set<string>>();

export const knownSlugsField = StateField.define<Set<string>>({
  create: () => new Set(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setKnownSlugs)) return e.value;
    return value;
  },
});

// ── widgets ──────────────────────────────────────────────────────────────────

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly slug: string,
    readonly title: string,
    readonly label: string,
    readonly missing: boolean,
  ) {
    super();
  }
  override eq(o: WikiLinkWidget) {
    return o.slug === this.slug && o.label === this.label && o.missing === this.missing;
  }
  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-wiki-link' + (this.missing ? ' cm-wiki-link--missing' : '');
    el.textContent = this.label;
    el.dataset['slug'] = this.slug;
    el.dataset['title'] = this.title;
    return el;
  }
  override ignoreEvent() {
    return false;
  }
}

class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly url: string,
  ) {
    super();
  }
  override eq(o: LinkWidget) {
    return o.text === this.text && o.url === this.url;
  }
  override toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-ext-link';
    a.textContent = this.text;
    a.href = this.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  override ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly width: number | null = null,
    readonly height: number | null = null,
  ) {
    super();
  }
  override eq(o: ImageWidget) {
    return (
      o.url === this.url && o.alt === this.alt && o.width === this.width && o.height === this.height
    );
  }
  override toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-img';
    img.src = this.url;
    img.alt = this.alt;
    img.loading = 'lazy';
    if (this.width) img.style.width = `${this.width}px`;
    if (this.height) img.style.height = `${this.height}px`;
    return img;
  }
  override ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }
  override toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-bullet';
    s.textContent = '•';
    return s;
  }
}

class HrWidget extends WidgetType {
  override eq() {
    return true;
  }
  override toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-lp-hr';
    return hr;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  override eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.pos === this.pos;
  }
  override toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-task';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: box.checked ? '[x]' : '[ ]' },
      });
    });
    return box;
  }
  override ignoreEvent() {
    return false;
  }
}

// ── GFM table rendering ──────────────────────────────────────────────────────

type CellAlign = 'left' | 'center' | 'right' | null;

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

/** A deliberately small inline-Markdown renderer for the text inside table cells: escapes HTML
 *  first, then handles `[[wikilinks]]`, external links, `code`, bold, italic and strikethrough.
 *  Not a general Markdown engine — a cell with exotic syntax just shows its (escaped) source. */
function renderCell(src: string, known: Set<string>): string {
  let s = escHtml(src);
  s = s.replace(/\[\[([^[\]\n]+)\]\]/g, (whole, inner: string) => {
    const pipe = inner.indexOf('|');
    const beforeAlias = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
    const hash = beforeAlias.indexOf('#');
    const target = (hash >= 0 ? beforeAlias.slice(0, hash) : beforeAlias).trim();
    const heading = hash >= 0 ? beforeAlias.slice(hash + 1).trim() : '';
    const slug = slugify(target);
    const missing = !slug || !known.has(slug);
    const label = alias || target || heading || whole;
    return `<span class="cm-wiki-link${missing ? ' cm-wiki-link--missing' : ''}" data-slug="${slug}" data-title="${target}">${label}</span>`;
  });
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_w, text: string, url: string) =>
      `<a class="cm-ext-link" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );
  s = s.replace(/`([^`]+)`/g, '<code class="cm-lp-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~]+)~~/g, '<span class="cm-lp-strike">$1</span>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}

/** Split one table row on unescaped `|`, dropping the optional leading/trailing pipe. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
    } else if (ch === '|') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

class TableWidget extends WidgetType {
  constructor(
    readonly headers: string[],
    readonly aligns: CellAlign[],
    readonly rows: string[][],
    readonly known: Set<string>,
    readonly key: string,
  ) {
    super();
  }

  static fromMarkdown(raw: string, known: Set<string>): TableWidget | null {
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) return null;
    const delims = splitRow(lines[1]);
    if (delims.length === 0 || !delims.every((d) => /^:?-+:?$/.test(d))) return null;
    const aligns: CellAlign[] = delims.map((d) => {
      const l = d.startsWith(':');
      const r = d.endsWith(':');
      return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
    });
    const headers = splitRow(lines[0]);
    const rows = lines.slice(2).map(splitRow);
    // Fold each contained wikilink's exists/missing state into the key so the widget re-renders
    // when the set of known pages changes even though the source text has not.
    let missKey = '';
    const wl = /\[\[([^[\]\n|#]+)/g;
    let m: RegExpExecArray | null;
    while ((m = wl.exec(raw))) missKey += known.has(slugify(m[1].trim())) ? '1' : '0';
    return new TableWidget(headers, aligns, rows, known, raw + ' ' + missKey);
  }

  override eq(o: TableWidget) {
    return o.key === this.key;
  }

  override toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-lp-table';

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    this.headers.forEach((h, i) => {
      const th = document.createElement('th');
      const a = this.aligns[i];
      if (a) th.style.textAlign = a;
      th.innerHTML = renderCell(h, this.known);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.rows) {
      const tr = document.createElement('tr');
      for (let i = 0; i < this.headers.length; i++) {
        const td = document.createElement('td');
        const a = this.aligns[i];
        if (a) td.style.textAlign = a;
        td.innerHTML = renderCell(row[i] ?? '', this.known);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrap.appendChild(table);
    return wrap;
  }

  override ignoreEvent() {
    // Let clicks through: the plugin's mousedown handler opens `[[wikilinks]]` in cells, and in an
    // editable view a click drops the caret in, which reveals the raw Markdown for editing.
    return false;
  }
}

// ── callouts & inline helpers ────────────────────────────────────────────────

/** Obsidian callout keyword → canonical kind (drives colour, icon and default label). */
const CALLOUT_KIND: Record<string, string> = {
  note: 'note',
  info: 'note',
  abstract: 'note',
  summary: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  failure: 'danger',
  fail: 'danger',
  success: 'success',
  done: 'success',
  check: 'success',
  question: 'question',
  faq: 'question',
  help: 'question',
  quote: 'quote',
  cite: 'quote',
  example: 'example',
  secret: 'secret',
  dm: 'secret',
  lore: 'lore',
  read: 'read',
  readaloud: 'read',
  'read-aloud': 'read',
  boxed: 'read',
};
const CALLOUT_LABEL: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  danger: 'Danger',
  success: 'Success',
  question: 'Question',
  quote: 'Quote',
  example: 'Example',
  secret: 'DM Secret',
  lore: 'Lore',
  read: 'Read Aloud',
};
const CALLOUT_ICON: Record<string, string> = {
  note: 'ℹ️',
  tip: '💡',
  warning: '⚠️',
  danger: '🔥',
  success: '✅',
  question: '❓',
  quote: '“',
  example: '📖',
  secret: '🗝️',
  lore: '📜',
  read: '🎙️',
};

/** Header pill (icon + label) shown in place of the raw `[!type]` token on a callout's first line. */
class CalloutHeaderWidget extends WidgetType {
  constructor(
    readonly kind: string,
    readonly label: string,
  ) {
    super();
  }
  override eq(o: CalloutHeaderWidget) {
    return o.kind === this.kind && o.label === this.label;
  }
  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-lp-callout-title';
    const icon = document.createElement('span');
    icon.className = 'cm-lp-callout-icon';
    icon.textContent = CALLOUT_ICON[this.kind] ?? '📌';
    el.append(icon);
    if (this.label) el.append(this.label);
    return el;
  }
  override ignoreEvent() {
    return false;
  }
}

/** `alt|WIDTH` / `alt|WIDTHxHEIGHT` sizing hint carried in a Markdown image's alt text. */
function parseImageAlt(raw: string): { alt: string; width: number | null; height: number | null } {
  const pipe = raw.lastIndexOf('|');
  if (pipe < 0) return { alt: raw, width: null, height: null };
  const m = /^(\d+)(?:\s*x\s*(\d+))?$/i.exec(raw.slice(pipe + 1).trim());
  if (!m) return { alt: raw, width: null, height: null };
  return { alt: raw.slice(0, pipe).trim(), width: +m[1], height: m[2] ? +m[2] : null };
}

/** An http(s)/mailto/tel/xmpp href for a bare or `<>` autolink, or null to leave it as plain text. */
function autolinkHref(inner: string): string | null {
  const url = /^[a-z][\w+.-]*:/i.test(inner) ? inner : `https://${inner}`;
  return /^(https?|mailto|tel|xmpp):/i.test(url) ? url : null;
}

// ── decoration building ──────────────────────────────────────────────────────

const WIKILINK_RE = /\[\[([^[\]\n]+)\]\]/g;
const HIGHLIGHT_RE = /(^|[^=])==(?!=)([^=\n]+?)==(?!=)/g;

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  const sel = state.selection.main;
  const known = state.field(knownSlugsField, false) ?? new Set<string>();
  const doc = state.doc;
  // Spans of GFM tables that `tableDecoField` renders as a block `<table>` widget. Every inline
  // pass here must skip them, or its decoration would overlap that widget. Collected up front (not
  // during the visible-range walk) so a table starting above the viewport is still covered.
  const tree = syntaxTree(state);
  const tableRanges: [number, number][] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name !== 'Table') return true;
      if (TableWidget.fromMarkdown(doc.sliceString(node.from, node.to), known)) {
        tableRanges.push([node.from, node.to]);
      }
      return false;
    },
  });
  const inTable = (pos: number) => tableRanges.some(([f, tt]) => pos >= f && pos < tt);

  // A read-only view (the hub embed) has no caret to edit with, so never fall back to raw syntax —
  // always render `#`, `[[ ]]`, `*`, `` ` ``, etc. as their formatted form.
  const reveal = !state.readOnly;
  const touches = (from: number, to: number) => reveal && sel.from <= to && sel.to >= from;
  const lineTouched = (pos: number) => {
    if (!reveal) return false;
    const l = doc.lineAt(pos);
    return sel.from <= l.to && sel.to >= l.from;
  };
  const eachLine = (from: number, to: number, cls: string) => {
    for (let p = from; p <= to;) {
      const line = doc.lineAt(p);
      ranges.push(Decoration.line({ class: cls }).range(line.from));
      if (line.to + 1 > to) break;
      p = line.to + 1;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // A rendered table is owned by `tableDecoField`'s block widget; skip it and its children
        // here so no inline decoration overlaps that widget.
        if (inTable(node.from)) return;

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          ranges.push(
            Decoration.line({ class: `cm-lp-h${heading[1]}` }).range(doc.lineAt(node.from).from),
          );
          return;
        }
        if (name === 'HeaderMark') {
          if (lineTouched(node.from)) return;
          let end = node.to;
          if (doc.sliceString(end, end + 1) === ' ') end += 1;
          ranges.push(Decoration.replace({}).range(node.from, end));
          return;
        }

        if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
          const cls =
            name === 'StrongEmphasis'
              ? 'cm-lp-strong'
              : name === 'Emphasis'
                ? 'cm-lp-em'
                : 'cm-lp-strike';
          ranges.push(Decoration.mark({ class: cls }).range(node.from, node.to));
          return;
        }
        if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
          const parent = node.node.parent;
          if (parent && touches(parent.from, parent.to)) return;
          ranges.push(Decoration.replace({}).range(node.from, node.to));
          return;
        }
        if (name === 'InlineCode') {
          ranges.push(Decoration.mark({ class: 'cm-lp-code' }).range(node.from, node.to));
          return;
        }
        if (name === 'CodeMark') {
          const parent = node.node.parent;
          if (!parent || parent.name !== 'InlineCode' || touches(parent.from, parent.to)) return;
          ranges.push(Decoration.replace({}).range(node.from, node.to));
          return;
        }

        if (name === 'Image') {
          if (touches(node.from, node.to)) return;
          const m = /^!\[([^\]]*)\]\(\s*(\S+?)\s*(?:"[^"]*")?\)$/.exec(
            doc.sliceString(node.from, node.to),
          );
          if (!m) return;
          const sized = parseImageAlt(m[1]);
          ranges.push(
            Decoration.replace({
              widget: new ImageWidget(m[2], sized.alt, sized.width, sized.height),
            }).range(node.from, node.to),
          );
          return;
        }

        if (name === 'Link') {
          if (touches(node.from, node.to)) return;
          const m = /^\[([^\]]*)\]\(([^)]+)\)$/.exec(doc.sliceString(node.from, node.to));
          if (!m) return;
          const url = m[2].trim();
          if (!/^https?:\/\//i.test(url)) return;
          ranges.push(
            Decoration.replace({ widget: new LinkWidget(m[1] || url, url) }).range(
              node.from,
              node.to,
            ),
          );
          return;
        }

        // Bare `https://…` / `www.…` (GFM autolink) and `<https://…>` — render as a clickable link.
        if (name === 'Autolink' || name === 'URL') {
          if (name === 'URL') {
            const p = node.node.parent?.name;
            if (p === 'Link' || p === 'Image' || p === 'Autolink') return;
          }
          if (touches(node.from, node.to)) return;
          const inner = doc.sliceString(node.from, node.to).replace(/^<|>$/g, '');
          const href = autolinkHref(inner);
          if (!href) return;
          ranges.push(
            Decoration.replace({ widget: new LinkWidget(inner, href) }).range(node.from, node.to),
          );
          return;
        }

        if (name === 'Blockquote') {
          const first = doc.lineAt(node.from);
          const cal = /^(\s*>\s?)(\[!([\w-]+)\][+-]?\s*)(.*)$/.exec(first.text);
          if (cal) {
            const kind = CALLOUT_KIND[cal[3].toLowerCase()] ?? 'note';
            eachLine(node.from, node.to, `cm-lp-callout cm-lp-callout--${kind}`);
            if (!lineTouched(first.from)) {
              const tagStart = first.from + cal[1].length;
              const tagEnd = tagStart + cal[2].length;
              const title = cal[4].trim();
              ranges.push(
                Decoration.replace({
                  widget: new CalloutHeaderWidget(kind, title ? '' : CALLOUT_LABEL[kind]),
                }).range(tagStart, tagEnd),
              );
              if (title) {
                ranges.push(
                  Decoration.mark({ class: 'cm-lp-callout-title' }).range(tagEnd, first.to),
                );
              }
            }
            return;
          }
          eachLine(node.from, node.to, 'cm-lp-quote');
          return;
        }
        if (name === 'QuoteMark') {
          if (lineTouched(node.from)) return;
          let end = node.to;
          if (doc.sliceString(end, end + 1) === ' ') end += 1;
          ranges.push(Decoration.replace({}).range(node.from, end));
          return;
        }

        if (name === 'ListMark') {
          const item = node.node.parent;
          const isTask =
            !!item && /^\s*[-*+]\s+\[[ xX]\]/.test(doc.sliceString(item.from, item.to));
          if (isTask || lineTouched(node.from)) return;
          if (/^[-*+]$/.test(doc.sliceString(node.from, node.to))) {
            ranges.push(
              Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
            );
          }
          return;
        }
        if (name === 'TaskMarker') {
          if (lineTouched(node.from)) return;
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(/x/i.test(doc.sliceString(node.from, node.to)), node.from),
            }).range(node.from, node.to),
          );
          return;
        }

        if (name === 'HorizontalRule') {
          if (lineTouched(node.from)) return;
          const line = doc.lineAt(node.from);
          ranges.push(Decoration.replace({ widget: new HrWidget() }).range(line.from, line.to));
          return;
        }

        if (name === 'FencedCode') {
          eachLine(node.from, node.to, 'cm-lp-codeblock');
          return;
        }
      },
    });

    // `[[wikilinks]]` and `==highlights==` aren't part of the Markdown grammar — scan text directly.
    // Narrow guard (wikilinks): only skip code, where `[[` is meant literally.
    const inCode = (pos: number) => {
      const n = tree.resolveInner(pos, 1).name;
      return n === 'InlineCode' || n === 'FencedCode' || n === 'CodeText';
    };
    // Broad guard (highlights): also skip any node we replace wholesale, so no replace overlaps.
    const inReplacedInline = (pos: number) => {
      for (
        let n: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, 1);
        n;
        n = n.parent
      ) {
        if (/^(InlineCode|FencedCode|CodeText|URL|Link|Image|Autolink)$/.test(n.name)) return true;
      }
      return false;
    };
    for (let p = from; p <= to;) {
      const line = doc.lineAt(p);

      WIKILINK_RE.lastIndex = 0;
      const wlSpans: [number, number][] = [];
      let m: RegExpExecArray | null;
      while ((m = WIKILINK_RE.exec(line.text))) {
        const mFrom = line.from + m.index;
        const mTo = mFrom + m[0].length;
        if (touches(mFrom, mTo)) continue;
        if (inTable(mFrom) || inCode(mFrom)) continue;
        wlSpans.push([mFrom, mTo]);
        const pipe = m[1].indexOf('|');
        const beforeAlias = pipe >= 0 ? m[1].slice(0, pipe) : m[1];
        const alias = pipe >= 0 ? m[1].slice(pipe + 1).trim() : '';
        const hash = beforeAlias.indexOf('#');
        const target = (hash >= 0 ? beforeAlias.slice(0, hash) : beforeAlias).trim();
        const heading = hash >= 0 ? beforeAlias.slice(hash + 1).trim() : '';
        const slug = slugify(target);
        ranges.push(
          Decoration.replace({
            widget: new WikiLinkWidget(
              slug,
              target,
              alias || target || heading,
              !slug || !known.has(slug),
            ),
          }).range(mFrom, mTo),
        );
      }

      HIGHLIGHT_RE.lastIndex = 0;
      let hm: RegExpExecArray | null;
      while ((hm = HIGHLIGHT_RE.exec(line.text))) {
        const open = line.from + hm.index + hm[1].length;
        const inner = open + 2;
        const close = inner + hm[2].length;
        const end = close + 2;
        if (touches(open, end) || inTable(open) || inReplacedInline(open)) continue;
        if (wlSpans.some(([a, b]) => open < b && end > a)) continue;
        ranges.push(Decoration.replace({}).range(open, inner));
        ranges.push(Decoration.mark({ class: 'cm-lp-mark' }).range(inner, close));
        ranges.push(Decoration.replace({}).range(close, end));
      }

      if (line.to + 1 > to) break;
      p = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

// ── table decorations (block replace — must be provided directly, not via a plugin) ───────────

function buildTableDecorations(state: EditorState): DecorationSet {
  const reveal = !state.readOnly;
  const sel = state.selection.main;
  const known = state.field(knownSlugsField, false) ?? new Set<string>();
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      // Caret inside the table → leave the raw Markdown visible so it can be edited.
      if (reveal && sel.from <= node.to && sel.to >= node.from) return false;
      const widget = TableWidget.fromMarkdown(doc.sliceString(node.from, node.to), known);
      if (widget) {
        ranges.push(Decoration.replace({ widget, block: true }).range(node.from, node.to));
      }
      return false;
    },
  });

  return Decoration.set(ranges, true);
}

/** Rendered `<table>` widgets for GFM tables. Kept out of the `livePreview` view plugin because
 *  block-replacing decorations (ones that swallow line breaks) may only be provided directly. */
const tableDecoField = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setKnownSlugs))) {
      return buildTableDecorations(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── theme ────────────────────────────────────────────────────────────────────

const livePreviewTheme = EditorView.theme({
  '.cm-lp-h1': { fontSize: '1.6rem', fontWeight: '700', lineHeight: '1.3' },
  '.cm-lp-h2': { fontSize: '1.35rem', fontWeight: '700', lineHeight: '1.3' },
  '.cm-lp-h3': { fontSize: '1.15rem', fontWeight: '700' },
  '.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontSize: '1rem', fontWeight: '700' },
  '.cm-lp-strong': { fontWeight: '700' },
  '.cm-lp-em': { fontStyle: 'italic' },
  '.cm-lp-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-lp-code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '3px',
    padding: '0.05em 0.3em',
  },
  '.cm-lp-quote': {
    borderLeft: '3px solid rgba(212,175,55,0.5)',
    paddingLeft: '0.8em',
    color: 'rgba(255,255,255,0.72)',
  },
  '.cm-lp-codeblock': {
    background: 'rgba(0,0,0,0.28)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '.cm-lp-bullet': { color: 'rgba(212,175,55,0.9)', paddingRight: '0.4em' },
  '.cm-lp-img': {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '6px',
    margin: '0.5em 0',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  '.cm-lp-hr': {
    display: 'inline-block',
    width: '100%',
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.2)',
    margin: '0.4em 0',
  },
  '.cm-lp-task': { margin: '0 0.4em 0 0', verticalAlign: 'middle', cursor: 'pointer' },
  '.cm-lp-table-wrap': { overflowX: 'auto', margin: '0.7em 0', maxWidth: '100%' },
  '.cm-lp-table': { borderCollapse: 'collapse', fontSize: '0.95em', lineHeight: '1.4' },
  '.cm-lp-table th, .cm-lp-table td': {
    border: '1px solid rgba(255,255,255,0.16)',
    padding: '0.35em 0.7em',
    textAlign: 'left',
    verticalAlign: 'top',
  },
  '.cm-lp-table th': { background: 'rgba(255,255,255,0.07)', fontWeight: '700' },
  '.cm-lp-table tbody tr:nth-child(even) td': { background: 'rgba(255,255,255,0.025)' },
  '.cm-lp-mark': {
    background: 'rgba(212,175,55,0.28)',
    borderRadius: '2px',
    padding: '0 0.12em',
  },
  '.cm-lp-callout': {
    borderLeft: '3px solid var(--cbd, rgba(212,175,55,0.55))',
    background: 'var(--cbg, rgba(212,175,55,0.06))',
    paddingLeft: '0.8em',
  },
  '.cm-lp-callout .cm-lp-callout-title': { fontWeight: '700', color: 'var(--cbd, #d4af37)' },
  '.cm-lp-callout-icon': { marginRight: '0.4em' },
  '.cm-lp-callout--note': { '--cbd': '#5b9bd5', '--cbg': 'rgba(91,155,213,0.09)' },
  '.cm-lp-callout--tip': { '--cbd': '#49b382', '--cbg': 'rgba(73,179,130,0.09)' },
  '.cm-lp-callout--warning': { '--cbd': '#d9a13b', '--cbg': 'rgba(217,161,59,0.12)' },
  '.cm-lp-callout--danger': { '--cbd': '#d9534f', '--cbg': 'rgba(217,83,79,0.12)' },
  '.cm-lp-callout--success': { '--cbd': '#49b382', '--cbg': 'rgba(73,179,130,0.09)' },
  '.cm-lp-callout--question': { '--cbd': '#48b0a0', '--cbg': 'rgba(72,176,160,0.09)' },
  '.cm-lp-callout--quote': { '--cbd': 'rgba(255,255,255,0.4)', '--cbg': 'rgba(255,255,255,0.045)' },
  '.cm-lp-callout--example': { '--cbd': '#a98ed6', '--cbg': 'rgba(169,142,214,0.09)' },
  '.cm-lp-callout--secret': { '--cbd': '#a06fd0', '--cbg': 'rgba(160,111,208,0.14)' },
  '.cm-lp-callout--lore': { '--cbd': '#d4af37', '--cbg': 'rgba(212,175,55,0.09)' },
  '.cm-lp-callout--read': { '--cbd': '#c9a94e', '--cbg': 'rgba(201,169,78,0.12)' },
  '.cm-wiki-link': {
    color: 'var(--dnd-gold, #d4af37)',
    borderBottom: '1px solid rgba(212,175,55,0.4)',
    cursor: 'pointer',
  },
  '.cm-wiki-link--missing': {
    color: '#e0a3a3',
    borderBottom: '1px dashed rgba(224,163,163,0.5)',
  },
  '.cm-ext-link': {
    color: 'var(--dnd-gold, #d4af37)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
});

const livePreviewHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700' },
  { tag: t.link, color: 'var(--dnd-gold, #d4af37)' },
  { tag: t.url, color: 'rgba(255,255,255,0.5)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { tag: [t.processingInstruction, t.meta], color: 'rgba(255,255,255,0.35)' },
]);

// ── public extension ─────────────────────────────────────────────────────────

export function livePreview(handlers: LivePreviewHandlers) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(u: ViewUpdate) {
        const slugsChanged = u.transactions.some((tr) =>
          tr.effects.some((e) => e.is(setKnownSlugs)),
        );
        if (u.docChanged || u.selectionSet || u.viewportChanged || slugsChanged) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event: MouseEvent) {
          const pill = (event.target as HTMLElement).closest('.cm-wiki-link') as HTMLElement | null;
          if (!pill) return false;
          event.preventDefault();
          const slug = pill.dataset['slug'] ?? '';
          const title = pill.dataset['title'] ?? '';
          if (!slug || pill.classList.contains('cm-wiki-link--missing')) handlers.createLink(title);
          else handlers.openLink(slug, title);
          return true;
        },
      },
    },
  );
  return [plugin, tableDecoField, livePreviewTheme, syntaxHighlighting(livePreviewHighlight)];
}
