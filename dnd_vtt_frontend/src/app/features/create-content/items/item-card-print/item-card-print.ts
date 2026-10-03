import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DndItem, itemDisplayName } from '../../../../core/services/content.service';

type ColorMode = 'rarity' | 'custom';
type BorderStyle = 'thin' | 'heavy' | 'ornate' | 'dotted' | 'none';
type CardFont = 'serif' | 'sans' | 'fantasy';
type PaperSize = 'letter' | 'a4';

const FONT_SCALES = [
  { label: 'Small', value: 0.85 },
  { label: 'Normal', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Extra Large', value: 1.3 },
];

// Standard poker-size playing card (2.5in x 3.5in), laid out 3x3 — the same grid as a 9-pocket
// trading-card binder page, so a printed sheet maps one-to-one onto a binder page. Keep in sync
// with $card-width/$card-height/$card-gap and the grid tracks in item-card-print.scss.
const CARD_WIDTH_MM = 63.5;
const CARD_HEIGHT_MM = 88.9;
const CARD_COLUMNS = 3;
const CARD_ROWS = 3;
// Space between neighboring cards. Letter is the constraint: three 88.9mm rows leave only 12.7mm
// of height, so every extra mm of gap here comes out of the top/bottom page margins.
const CARD_GAP_MM = 2;
const CARDS_PER_PAGE = CARD_COLUMNS * CARD_ROWS;

// The page is printed with a zero @page margin and the card grid is centered on the full sheet
// (see item-card-print.scss), so crop marks can sit in the margin outside the grid rather than on
// top of the cards. Centering also keeps fronts and backs aligned when duplexing.
const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
};

// A .print-page exactly as tall as the sheet can spill a sub-pixel rounding error onto a blank
// extra page in Chrome, so each page is shaved by this much (the grid stays centered within it).
const PAGE_HEIGHT_SLACK_MM = 1;

const RARITY_COLORS: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#2f9e4f',
  rare: '#2f6fd6',
  'very rare': '#8b3fd6',
  legendary: '#d68f1f',
  artifact: '#c23a3a',
};

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

// Both edges of every card, since with a gap between cards each one needs its own pair of cuts.
function cardEdges(count: number, size: number): number[] {
  return Array.from({ length: count }, (_, i) => i * (size + CARD_GAP_MM)).flatMap(start => [
    start,
    start + size,
  ]);
}

@Component({
  selector: 'app-item-card-print',
  imports: [FormsModule, MatIconModule, NgTemplateOutlet],
  templateUrl: './item-card-print.html',
  styleUrl: './item-card-print.scss',
})
export class ItemCardPrintComponent {
  readonly items = input.required<DndItem[]>();
  readonly closed = output<void>();

  colorMode   = signal<ColorMode>('rarity');
  customColor = signal('#8b3fd6');
  borderStyle = signal<BorderStyle>('ornate');
  font        = signal<CardFont>('fantasy');
  paperSize   = signal<PaperSize>('letter');
  fontScale   = signal(1.15);
  readonly fontScales = FONT_SCALES;

  showDescription = signal(true);
  showCostWeight  = signal(true);
  showExtras      = signal(true);
  showImage       = signal(true);
  printBacks      = signal(false);

  pages = computed(() => chunk(this.items(), CARDS_PER_PAGE));
  totalPrintedPages = computed(() => this.pages().length * (this.printBacks() ? 2 : 1));

  pageSize = computed(() => {
    const paper = PAPER_SIZES_MM[this.paperSize()];
    return { width: paper.width, height: paper.height - PAGE_HEIGHT_SLACK_MM };
  });

  // Crop-mark positions (mm from the grid's top-left) at every card edge, including the outer ones.
  readonly colEdges = cardEdges(CARD_COLUMNS, CARD_WIDTH_MM);
  readonly rowEdges = cardEdges(CARD_ROWS, CARD_HEIGHT_MM);

  constructor() {
    // Component styles can't set a dynamic @page size, so inject one into <head> to make the print
    // dialog default to the selected paper instead of whatever the printer's default is.
    const doc = inject(DOCUMENT);
    const pageStyle = doc.createElement('style');
    doc.head.appendChild(pageStyle);
    inject(DestroyRef).onDestroy(() => pageStyle.remove());
    effect(() => {
      pageStyle.textContent = `@media print { @page { size: ${this.paperSize()} portrait; margin: 0; } }`;
    });
  }

  cardColor(item: DndItem): string {
    if (this.colorMode() === 'custom') return this.customColor();
    return RARITY_COLORS[item.rarity?.toLowerCase() ?? ''] ?? RARITY_COLORS['common'];
  }

  // Mirrors each row (reverses card order within every CARD_COLUMNS-wide row) so that duplexing
  // this page immediately after its front — flipped on the long edge, the common default — lands
  // each back directly behind its matching front card instead of mirrored across the row. A short
  // final row is padded with empty slots first, or its backs would land behind the wrong column.
  backCards(page: DndItem[]): (DndItem | null)[] {
    return chunk(page, CARD_COLUMNS).flatMap(row => {
      const padded: (DndItem | null)[] = [...row];
      while (padded.length < CARD_COLUMNS) padded.push(null);
      return padded.reverse();
    });
  }

  fontFamily(): string {
    switch (this.font()) {
      case 'sans': return 'system-ui, sans-serif';
      case 'fantasy': return '"Cinzel", serif';
      default: return 'Georgia, "Times New Roman", serif';
    }
  }

  readonly itemDisplayName = itemDisplayName;

  subtitle(item: DndItem): string {
    const parts = [item.type, item.category];
    if (item.rarity) parts.push(item.rarity);
    return parts.filter(Boolean).join(' · ');
  }

  attunementText(item: DndItem): string | null {
    if (!item.requires_attunement) return null;
    return typeof item.requires_attunement === 'string'
      ? `Requires attunement ${item.requires_attunement}`
      : 'Requires attunement';
  }

  print() { window.print(); }
  close() { this.closed.emit(); }
}
