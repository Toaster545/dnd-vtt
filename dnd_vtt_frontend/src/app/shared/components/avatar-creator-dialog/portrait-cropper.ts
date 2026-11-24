import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

// Output size of the cropped portrait. Tokens and every portrait <img> draw it as a square clipped
// to its inscribed circle, so the circle guide in the viewport is exactly what ends up visible.
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 6;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Pan/zoom an uploaded image under a circular token guide. Coordinates are kept as fractions of
// the viewport (offset) and a multiple of the "cover" scale (zoom), so the crop is independent of
// how large the viewport happens to render.
@Component({
  selector: 'app-portrait-cropper',
  imports: [MatIconModule],
  template: `
    @if (image(); as img) {
      <div
        #viewport
        class="crop-viewport"
        (pointerdown)="startDrag($event)"
        (pointermove)="drag($event)"
        (pointerup)="endDrag($event)"
        (pointercancel)="endDrag($event)"
        (wheel)="wheel($event)"
        aria-label="Drag to position the portrait, scroll to zoom"
      >
        <img
          [src]="img.src"
          alt=""
          draggable="false"
          [style.width.%]="imageWidthPercent()"
          [style.height.%]="imageHeightPercent()"
          [style.left.%]="imageLeftPercent()"
          [style.top.%]="imageTopPercent()"
        />
        <div class="crop-mask" aria-hidden="true"></div>
      </div>
      <div class="flex items-center gap-2 mt-3">
        <mat-icon class="text-slate text-base" aria-hidden="true">zoom_out</mat-icon>
        <input
          type="range"
          class="flex-1"
          min="1"
          [max]="maxZoom"
          step="0.01"
          [value]="zoom()"
          (input)="setZoom(+$any($event.target).value)"
          aria-label="Zoom"
        />
        <mat-icon class="text-slate text-base" aria-hidden="true">zoom_in</mat-icon>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button type="button" class="btn-ghost px-3" (click)="fileInput.click()">
          <mat-icon class="text-base">image</mat-icon>
          Choose another
        </button>
        <button type="button" class="btn-ghost px-3" (click)="resetCrop()">
          <mat-icon class="text-base">center_focus_strong</mat-icon>
          Reset
        </button>
      </div>
    } @else {
      <button
        type="button"
        class="drop-zone"
        [class.dragging]="dropHover()"
        (click)="fileInput.click()"
        (dragover)="$event.preventDefault(); dropHover.set(true)"
        (dragleave)="dropHover.set(false)"
        (drop)="dropFile($event)"
      >
        <mat-icon class="text-gold !w-10 !h-10 !text-[40px]" aria-hidden="true">upload</mat-icon>
        <span class="text-parchment">Choose an image or drop it here</span>
        <span class="text-xs text-slate">PNG, JPEG, WebP or GIF · you can also paste one</span>
      </button>
    }
    @if (error(); as message) {
      <p class="text-xs text-red-400 mt-2 mb-0" role="alert">{{ message }}</p>
    }
    <input
      #fileInput
      type="file"
      class="hidden"
      [attr.accept]="acceptedTypes"
      (change)="pickFile($event)"
    />
  `,
  styles: `
    :host {
      display: block;
    }
    .crop-viewport,
    .drop-zone {
      position: relative;
      width: min(100%, 340px);
      aspect-ratio: 1;
      margin: 0 auto;
      overflow: hidden;
      border-radius: 8px;
      background: rgb(var(--dnd-text-rgb) / 0.04);
    }
    .crop-viewport {
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .crop-viewport:active {
      cursor: grabbing;
    }
    .crop-viewport img {
      position: absolute;
      max-width: none;
      pointer-events: none;
    }
    .crop-mask {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      box-shadow:
        0 0 0 2px var(--dnd-gold),
        0 0 0 9999px rgb(0 0 0 / 0.55);
      pointer-events: none;
    }
    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      border: 2px dashed rgb(var(--dnd-text-rgb) / 0.2);
      font: inherit;
      text-align: center;
      cursor: pointer;
    }
    .drop-zone:hover,
    .drop-zone:focus-visible,
    .drop-zone.dragging {
      border-color: var(--dnd-gold);
      outline: none;
    }
  `,
  host: { '(document:paste)': 'paste($event)' },
})
export class PortraitCropperComponent {
  readonly changed = output<void>();
  readonly acceptedTypes = ACCEPTED_TYPES.join(',');
  readonly maxZoom = MAX_ZOOM;

  readonly image = signal<HTMLImageElement | null>(null);
  readonly zoom = signal(1);
  // Image center relative to the viewport center, as a fraction of the viewport size.
  readonly offset = signal({ x: 0, y: 0 });
  readonly error = signal('');
  readonly dropHover = signal(false);

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private dragStart: { x: number; y: number; offset: { x: number; y: number } } | null = null;
  private objectUrl: string | null = null;

  // Image size as a fraction of the viewport: at zoom 1 the shorter side exactly fills it.
  private readonly size = computed(() => {
    const img = this.image();
    if (!img) return { w: 1, h: 1 };
    const cover = 1 / Math.min(img.naturalWidth, img.naturalHeight);
    return {
      w: img.naturalWidth * cover * this.zoom(),
      h: img.naturalHeight * cover * this.zoom(),
    };
  });
  readonly imageWidthPercent = computed(() => this.size().w * 100);
  readonly imageHeightPercent = computed(() => this.size().h * 100);
  readonly imageLeftPercent = computed(() => (0.5 + this.offset().x - this.size().w / 2) * 100);
  readonly imageTopPercent = computed(() => (0.5 + this.offset().y - this.size().h / 2) * 100);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokeObjectUrl());
  }

  pickFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.load(file);
  }

  dropFile(event: DragEvent) {
    event.preventDefault();
    this.dropHover.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.load(file);
  }

  paste(event: ClipboardEvent) {
    const file = Array.from(event.clipboardData?.files ?? []).find((candidate) =>
      ACCEPTED_TYPES.includes(candidate.type),
    );
    if (!file) return;
    event.preventDefault();
    this.load(file);
  }

  load(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.error.set('That file type is not supported. Use PNG, JPEG, WebP or GIF.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.revokeObjectUrl();
      this.objectUrl = url;
      this.error.set('');
      this.image.set(img);
      this.resetCrop();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.error.set('That image could not be read.');
    };
    img.src = url;
  }

  resetCrop() {
    this.zoom.set(1);
    this.offset.set({ x: 0, y: 0 });
    this.changed.emit();
  }

  setZoom(value: number) {
    this.zoom.set(Math.min(MAX_ZOOM, Math.max(1, value)));
    this.offset.set(this.clampOffset(this.offset()));
    this.changed.emit();
  }

  wheel(event: WheelEvent) {
    event.preventDefault();
    this.setZoom(this.zoom() * Math.exp(-event.deltaY * 0.0015));
  }

  startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = { x: event.clientX, y: event.clientY, offset: this.offset() };
  }

  drag(event: PointerEvent) {
    const start = this.dragStart;
    const viewport = this.viewport()?.nativeElement;
    if (!start || !viewport) return;
    const width = viewport.clientWidth || 1;
    this.offset.set(
      this.clampOffset({
        x: start.offset.x + (event.clientX - start.x) / width,
        y: start.offset.y + (event.clientY - start.y) / width,
      }),
    );
  }

  endDrag(event: PointerEvent) {
    if (!this.dragStart) return;
    this.dragStart = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.changed.emit();
  }

  // Renders the current crop to a square image, or null when nothing has been loaded.
  async export(): Promise<Blob | null> {
    const canvas = this.render(OUTPUT_SIZE);
    if (!canvas) return null;
    // Browsers without WebP encoding hand back PNG instead, which the backend also accepts.
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  }

  // Small data-URL rendering of the current crop, for a live preview elsewhere in the dialog.
  previewDataUrl(): string | null {
    return this.render(160)?.toDataURL('image/png') ?? null;
  }

  private render(size: number): HTMLCanvasElement | null {
    const img = this.image();
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const { w, h } = this.size();
    const { x, y } = this.offset();
    context.imageSmoothingQuality = 'high';
    context.drawImage(img, (0.5 + x - w / 2) * size, (0.5 + y - h / 2) * size, w * size, h * size);
    return canvas;
  }

  // Keep the image covering the whole viewport so the token never shows an empty edge.
  private clampOffset(offset: { x: number; y: number }) {
    const { w, h } = this.size();
    const maxX = Math.max(0, (w - 1) / 2);
    const maxY = Math.max(0, (h - 1) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  }

  private revokeObjectUrl() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
