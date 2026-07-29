import Konva from 'konva';
import { MapFog } from '../../../core/models/campaign.model';

interface Cell { col: number; row: number; }

// Cell the pointer is currently over, floored like token placement — fog tools target whole
// cells, not free positions like the measure tool does.
export function cellUnderPointer(stage: Konva.Stage, cellSize: number): Cell | null {
  const pos = stage.getPointerPosition();
  if (!pos || !cellSize) return null;
  return { col: Math.floor(pos.x / cellSize), row: Math.floor(pos.y / cellSize) };
}

export function cellsInRect(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) {
    for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
      cells.push({ col, row });
    }
  }
  return cells;
}

export class FogTool {
  private paintingFog = false;
  private fogPaintRevealed = false;
  private fogPaintCells = new Set<string>();
  private lastFogPaintBroadcast = 0;
  private rectStart: Cell | null = null;
  private rectEnd: Cell | null = null;

  constructor(private onPaint: (cells: Cell[], revealed: boolean) => void) {}

  get isPaintingBrush(): boolean {
    return this.paintingFog;
  }

  get isDraggingRect(): boolean {
    return this.rectStart !== null;
  }

  reset() {
    this.paintingFog = false;
    this.fogPaintCells.clear();
    this.rectStart = null;
    this.rectEnd = null;
  }

  beginBrush(revealed: boolean, cell: Cell | null) {
    this.paintingFog = true;
    this.fogPaintRevealed = revealed;
    this.fogPaintCells.clear();
    if (cell) this.paintCell(cell);
  }

  continueBrush(cell: Cell | null) {
    if (!this.paintingFog || !cell) return;
    this.paintCell(cell);
  }

  endBrush() {
    if (!this.paintingFog) return;
    this.flushPaint();
    this.paintingFog = false;
  }

  private paintCell(cell: Cell) {
    this.fogPaintCells.add(`${cell.col},${cell.row}`);

    // Throttled so a raw mousemove stream doesn't flood the backend.
    const now = Date.now();
    if (now - this.lastFogPaintBroadcast > 50) {
      this.lastFogPaintBroadcast = now;
      this.flushPaint();
    }
  }

  // Sends only the cells touched since the last flush, then clears them.
  private flushPaint() {
    if (this.fogPaintCells.size === 0) return;
    const cells = [...this.fogPaintCells].map(key => {
      const [col, row] = key.split(',').map(Number);
      return { col, row };
    });
    this.fogPaintCells.clear();
    this.onPaint(cells, this.fogPaintRevealed);
  }

  beginRect(cell: Cell | null) {
    if (!cell) return;
    this.rectStart = cell;
    this.rectEnd = cell;
  }

  updateRect(cell: Cell | null) {
    if (!this.rectStart || !cell) return;
    this.rectEnd = cell;
  }

  endRect(revealed: boolean) {
    if (!this.rectStart || !this.rectEnd) return;
    const cells = cellsInRect(this.rectStart, this.rectEnd);
    this.rectStart = null;
    this.rectEnd = null;
    this.onPaint(cells, revealed);
  }

  render(
    layer: Konva.Layer,
    fog: MapFog,
    isAdmin: boolean,
    img: HTMLImageElement | undefined,
    gridSize: number,
    cellSize: number,
    revealingRectPreview: boolean,
  ) {
    layer.destroyChildren();
    if (fog.enabled && img && cellSize) {
      const cols = Math.ceil(img.width / gridSize);
      const rows = Math.ceil(img.height / gridSize);
      const hidden = new Set(fog.hidden_cells);
      const tint = isAdmin ? 'rgba(215,220,225,0.4)' : 'rgba(125, 126, 128, 1)';
      const width = cols * cellSize;
      const height = rows * cellSize;

      const fogShape = new Konva.Shape({
        listening: false,
        width,
        height,
        sceneFunc: context => {
          context.beginPath();
          for (const key of hidden) {
            const [col, row] = key.split(',').map(Number);
            context.rect(col * cellSize, row * cellSize, cellSize, cellSize);
          }
          context.closePath();
          context.fillStyle = tint;
          context.fill();
        },
      });
      layer.add(fogShape);
    }
    if (this.rectStart && this.rectEnd && cellSize) {
      const minCol = Math.min(this.rectStart.col, this.rectEnd.col);
      const maxCol = Math.max(this.rectStart.col, this.rectEnd.col);
      const minRow = Math.min(this.rectStart.row, this.rectEnd.row);
      const maxRow = Math.max(this.rectStart.row, this.rectEnd.row);
      layer.add(new Konva.Rect({
        x: minCol * cellSize, y: minRow * cellSize,
        width: (maxCol - minCol + 1) * cellSize, height: (maxRow - minRow + 1) * cellSize,
        stroke: '#f5d67a', strokeWidth: 2,
        fill: revealingRectPreview ? 'rgba(245, 214, 122, 0.15)' : 'rgba(0, 0, 0, 0.5)',
      }));
    }
    layer.draw();
  }
}
