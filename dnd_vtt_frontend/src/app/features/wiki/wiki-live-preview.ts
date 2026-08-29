import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { Range, StateEffect, StateField } from '@codemirror/state';
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
  ) {
    super();
  }
  override eq(o: ImageWidget) {
    return o.url === this.url && o.alt === this.alt;
  }
  override toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-img';
    img.src = this.url;
    img.alt = this.alt;
    img.loading = 'lazy';
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

// ── decoration building ──────────────────────────────────────────────────────

const WIKILINK_RE = /\[\[([^[\]\n]+)\]\]/g;

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  const sel = state.selection.main;
  const known = state.field(knownSlugsField, false) ?? new Set<string>();
  const doc = state.doc;

  // A read-only view (the hub embed) has no caret to edit with, so never fall back to raw syntax —
  // always render `#`, `[[ ]]`, `*`, `` ` ``, etc. as their formatted form.
  const reveal = !state.readOnly;
  const touches = (from: number, to: number) =>
    reveal && sel.from <= to && sel.to >= from;
  const lineTouched = (pos: number) => {
    if (!reveal) return false;
    const l = doc.lineAt(pos);
    return sel.from <= l.to && sel.to >= l.from;
  };
  const eachLine = (from: number, to: number, cls: string) => {
    for (let p = from; p <= to; ) {
      const line = doc.lineAt(p);
      ranges.push(Decoration.line({ class: cls }).range(line.from));
      if (line.to + 1 > to) break;
      p = line.to + 1;
    }
  };

  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

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
          ranges.push(
            Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }).range(
              node.from,
              node.to,
            ),
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

        if (name === 'Blockquote') {
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

    // `[[wikilinks]]` are not part of the Markdown grammar, so scan the visible text directly.
    for (let p = from; p <= to; ) {
      const line = doc.lineAt(p);
      WIKILINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIKILINK_RE.exec(line.text))) {
        const mFrom = line.from + m.index;
        const mTo = mFrom + m[0].length;
        if (touches(mFrom, mTo)) continue;
        const inNode = tree.resolveInner(mFrom, 1).name;
        if (inNode === 'InlineCode' || inNode === 'FencedCode' || inNode === 'CodeText') continue;
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
      if (line.to + 1 > to) break;
      p = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

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
  return [plugin, livePreviewTheme, syntaxHighlighting(livePreviewHighlight)];
}
