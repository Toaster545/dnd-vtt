import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  Completion,
  CompletionContext,
  CompletionResult,
  autocompletion,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';

export interface WikiEditorPage {
  title: string;
  slug: string;
}

// Thin Angular wrapper around a CodeMirror 6 markdown editor. Keeps markdown as the source of
// truth (Obsidian "source mode") and offers `[[` page-link autocomplete fed from the wiki's
// current page list.
@Component({
  selector: 'app-wiki-editor',
  template: `<div #host class="wiki-editor-host"></div>`,
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
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
        line-height: 1.6;
      }
      .wiki-editor-host .cm-content {
        padding: 12px 14px;
      }
      .wiki-editor-host .cm-focused {
        outline: none;
      }
    `,
  ],
})
export class WikiEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input<string>('');
  readonly pages = input<WikiEditorPage[]>([]);
  readonly valueChange = output<string>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private view?: EditorView;
  private lastEmitted = signal('');

  private pagesRef = computed(() => this.pages());

  constructor() {
    // Push external value changes (page switch, revert) into the editor without echoing them
    // straight back out through valueChange.
    effect(() => {
      const next = this.value();
      const view = this.view;
      if (!view) return;
      if (next === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
      this.lastEmitted.set(next);
    });
  }

  ngAfterViewInit(): void {
    const completion = autocompletion({
      override: [(ctx) => this.wikiLinkCompletions(ctx)],
      icons: false,
    });

    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          placeholder('Write in Markdown. Use [[Page Name]] to link.'),
          completion,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const text = u.state.doc.toString();
            this.lastEmitted.set(text);
            this.valueChange.emit(text);
          }),
        ],
      }),
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
    const options: Completion[] = this.pagesRef().map((p) => ({
      label: p.title,
      type: 'text',
      apply: `${p.title}]]`,
    }));
    return {
      from: token.from + 2,
      options,
      validFor: /^[^\]\n]*$/,
    };
  }
}
