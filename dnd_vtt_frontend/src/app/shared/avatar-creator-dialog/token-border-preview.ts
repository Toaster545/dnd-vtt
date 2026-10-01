import { Component, ElementRef, effect, input, signal, viewChild } from '@angular/core';
import { TokenBorder } from '../../core/models/token-border.model';
import { strokeTokenBorder, tokenBorderInnerRadius } from '../../core/utils/token-border';

// The character's token as the battle map draws it — same strokeTokenBorder() call as
// token-renderer.ts, over a scrap of grid — so what the player picks is what the table sees.
@Component({
  selector: 'app-token-border-preview',
  template: `<canvas
    #canvas
    [style.width.px]="size()"
    [style.height.px]="size()"
    role="img"
    [attr.aria-label]="label()"
  ></canvas>`,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    canvas {
      border-radius: 10px;
    }
  `,
})
export class TokenBorderPreviewComponent {
  readonly imageSrc = input('');
  readonly border = input.required<TokenBorder>();
  readonly size = input(160);
  // Grid squares across the canvas; the token fills the middle one, like a Medium creature.
  readonly cells = input(3);
  readonly label = input('Token preview');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly image = signal<HTMLImageElement | null>(null);

  constructor() {
    effect((onCleanup) => {
      const src = this.imageSrc();
      this.image.set(null);
      if (!src) return;
      const img = new Image();
      let cancelled = false;
      img.onload = () => {
        if (!cancelled) this.image.set(img);
      };
      img.src = src;
      onCleanup(() => (cancelled = true));
    });
    effect(() => this.draw(this.border(), this.image(), this.size(), this.cells()));
  }

  private draw(border: TokenBorder, image: HTMLImageElement | null, size: number, cells: number) {
    const canvas = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#2a2620';
    ctx.fillRect(0, 0, size, size);
    const cell = size / cells;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cells; i++) {
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
    }
    ctx.stroke();

    const r = cell / 2;
    const faceR = tokenBorderInnerRadius(r, border);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.arc(0, 0, faceR, 0, Math.PI * 2);
    ctx.closePath();
    if (image) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(image, -faceR, -faceR, faceR * 2, faceR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#4b4438';
      ctx.fill();
    }
    strokeTokenBorder(ctx, r, border);
    ctx.restore();
  }
}
