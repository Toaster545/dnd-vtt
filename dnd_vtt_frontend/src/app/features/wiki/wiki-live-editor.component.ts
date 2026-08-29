import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  Completion,
  CompletionContext,
  CompletionResult,
  autocompletion,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { knownSlugsField, livePreview, setKnownSlugs } from './wiki-live-preview';

export interface WikiEditorPage {
  title: string;
  slug: string;
}

// Editor chrome (not markdown rendering): a visible caret, selection, and active-line tint that
// read on the app's dark parchment background. CodeMirror's native fallbacks are near-invisible
// here, so we render our own via drawSelection + theme rules.
const editorChromeTheme = EditorView.theme({
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--dnd-gold, #d4af37)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--dnd-gold, #d4af37)' },
  '.cm-selectionBackground, .cm-content ::selection': {
    background: 'rgba(212, 175, 55, 0.22)',
  },
  '&.cm-focused .cm-selectionBackground': { background: 'rgba(212, 175, 55, 0.3)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.035)' },
});

// Read-only mode (the hub embed): no caret / active-line tint, no text selection, and the content
// sits flush without the full-page editor's wide gutters and tall scroll runway.
const readonlyChromeTheme = EditorView.theme({
  '.cm-cursor, .cm-dropCursor': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-content': {
    padding: '4px 0 16px',
    maxWidth: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'default',
    textAlign: 'justify',
    textJustify: 'inter-word',
  },
  '.cm-selectionBackground, .cm-content ::selection': { background: 'transparent' },
});

// CodeMirror 6 wrapper for the wiki. Markdown stays the source of truth; the `livePreview`
// extension renders it inline (Obsidian-style) and `[[` autocompletes from the page list.
@Component({
  selector: 'app-wiki-live-editor',
  template: `<div #host class="wiki-editor-host"></div>`,
  host: { '[class.we-flow]': 'readonly() || flow()' },
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }
      .wiki-editor-host,
      .wiki-editor-host .cm-editor {
        height: 100%;
      }
      .wiki-editor-host .cm-scroller {
        overflow: auto;
        font-family: var(--dnd-font-body, ui-sans-serif, system-ui, sans-serif);
        font-size: 15px;
        line-height: 1.7;
      }
      .wiki-editor-host .cm-content {
        padding: 16px 20px 40vh;
        max-width: 46rem;
      }
      .wiki-editor-host .cm-focused {
        outline: none;
      }
      /* Read-only embed: size to the whole document and let the outer page scroll instead. */
      :host(.we-flow) {
        height: auto;
      }
      :host(.we-flow) .wiki-editor-host,
      :host(.we-flow) .cm-editor {
        height: auto;
      }
      :host(.we-flow) .cm-scroller {
        overflow: visible;
      }
      :host(.we-flow) .cm-content {
        padding: 4px 0 16px;
      }
    `,
  ],
})
export class WikiLiveEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input<string>('');
  readonly pages = input<WikiEditorPage[]>([]);
  readonly mode = input<'live' | 'source'>('live');
  readonly readonly = input(false);
  /** Size to the document and let an outer element scroll, instead of scrolling internally. */
  readonly flow = input(false);

  readonly valueChange = output<string>();
  readonly openLink = output<{ slug: string; title: string }>();
  readonly createLink = output<string>();
  readonly editorBlur = output<void>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private view?: EditorView;
  private liveComp = new Compartment();
  private readonlyComp = new Compartment();

  constructor() {
    // Push external value changes (page switch, autosave echo) into the editor without looping
    // them straight back out through valueChange.
    effect(() => {
      const next = this.value();
      const view = this.view;
      if (!view || next === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    });

    effect(() => {
      const slugs = new Set(this.pages().map((p) => p.slug));
      this.view?.dispatch({ effects: setKnownSlugs.of(slugs) });
    });

    // `livePreview` reads `state.readOnly` when it builds decorations, so toggling read-only has to
    // rebuild it — reconfigure both compartments together whenever either input changes.
    effect(() => {
      const live = this.mode() === 'live';
      const ro = this.readonly();
      this.view?.dispatch({
        effects: [
          this.readonlyComp.reconfigure(this.chromeExtension(ro)),
          this.liveComp.reconfigure(live ? this.liveExtension() : []),
        ],
      });
    });
  }

  private liveExtension() {
    return livePreview({
      openLink: (slug, title) => this.openLink.emit({ slug, title }),
      createLink: (title) => this.createLink.emit(title),
    });
  }

  /** Chrome for the read-only vs. editable state; swapped via `readonlyComp`. */
  private chromeExtension(readonly: boolean) {
    return readonly
      ? [EditorState.readOnly.of(true), EditorView.editable.of(false), readonlyChromeTheme]
      : [drawSelection(), dropCursor(), rectangularSelection(), highlightActiveLine()];
  }

  ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          history(),
          editorChromeTheme,
          // Tab / Shift-Tab indent and outdent the current line(s) instead of moving focus.
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          placeholder('Write in Markdown. Use [[Page Name]] to link.'),
          autocompletion({ override: [(ctx) => this.wikiLinkCompletions(ctx)], icons: false }),
          knownSlugsField,
          this.liveComp.of(this.mode() === 'live' ? this.liveExtension() : []),
          this.readonlyComp.of(this.chromeExtension(this.readonly())),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) this.valueChange.emit(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            blur: () => {
              this.editorBlur.emit();
            },
          }),
        ],
      }),
    });
    this.view.dispatch({
      effects: setKnownSlugs.of(new Set(this.pages().map((p) => p.slug))),
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  focus(): void {
    this.view?.focus();
  }

  private wikiLinkCompletions(ctx: CompletionContext): CompletionResult | null {
    const token = ctx.matchBefore(/\[\[[^\]\n]*$/);
    if (!token) return null;
    if (token.from === token.to && !ctx.explicit) return null;
    const options: Completion[] = this.pages().map((p) => ({
      label: p.title,
      type: 'text',
      apply: `${p.title}]]`,
    }));
    return { from: token.from + 2, options, validFor: /^[^\]\n]*$/ };
  }
}
