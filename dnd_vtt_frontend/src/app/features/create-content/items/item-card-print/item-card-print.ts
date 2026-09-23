import { Component, computed, input, output, signal } from '@angular/core';
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

const CARDS_PER_PAGE = 6;
const CARD_COLUMNS = 2;
const CARD_ROWS = 3;

// Matches the @page margin in item-card-print.scss — subtracted from the physical paper size to
// get the printable content box that .print-page is sized to fill exactly. A fixed, known page
// size (rather than sizing rows by content, as before) is what makes every card come out the same
// size, which is what makes a single cut line down the middle — and across each row — land evenly
// on every card instead of drifting page to page.
const PAGE_MARGIN_MM = 10;
const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
};

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

function fractionLines(count: number): number[] {
  const lines: number[] = [];
  for (let i = 1; i < count; i++) lines.push((i / count) * 100);
  return lines;
}

@Component({
  selector: 'app-item-card-print',
  imports: [FormsModule, MatIconModule],
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

  pageContentSize = computed(() => {
    const paper = PAPER_SIZES_MM[this.paperSize()];
    return { width: paper.width - 2 * PAGE_MARGIN_MM, height: paper.height - 2 * PAGE_MARGIN_MM };
  });

  // Cut-guide positions as percentages across the page — valid regardless of paper size or card
  // margin because columns/rows are equal-fr grid tracks with padding = half the gap (see scss),
  // which puts every boundary at an exact k/N fraction of the page.
  readonly colGuides = fractionLines(CARD_COLUMNS);
  readonly rowGuides = fractionLines(CARD_ROWS);

  cardColor(item: DndItem): string {
    if (this.colorMode() === 'custom') return this.customColor();
    return RARITY_COLORS[item.rarity?.toLowerCase() ?? ''] ?? RARITY_COLORS['common'];
  }

  // Mirrors each row (reverses card order within every CARD_COLUMNS-wide row) so that duplexing
  // this page immediately after its front — flipped on the long edge, the common default — lands
  // each back directly behind its matching front card instead of one column off.
  backCards(page: DndItem[]): DndItem[] {
    return chunk(page, CARD_COLUMNS).flatMap(row => [...row].reverse());
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
