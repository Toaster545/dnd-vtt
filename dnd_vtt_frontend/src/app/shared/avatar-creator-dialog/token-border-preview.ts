import { Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { TokenBorder } from '../../core/models/token-border.model';
import {
  artHasTransparency,
  drawBorderedToken,
  drawTokenFace,
  popOutSides,
  tokenBorderInnerRadius,
} from '../../core/utils/token-border';

// The character's token as the battle map draws it — same drawBorderedToken() call as
// token-renderer.ts, over a scrap of grid — so what the player picks is what the table sees.
@Component({
  selector: 'app-token-border-preview',
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `<canvas
    #canvas
    [style.width.px]="size() + pad().left + pad().right"
    [style.height.px]="size() + pad().top + pad().bottom"
    [style.left.px]="-pad().left"
    [style.top.px]="-pad().top"
    role="img"
    [attr.aria-label]="label()"
  ></canvas>`,
  styles: `
    :host {
      display: inline-block;
      position: relative;
      vertical-align: top;
      line-height: 0;
    }
    // Positioned against the size x size host so any pop-out headroom (see pad) overflows it
    // instead of making the host — and whatever button wraps it — larger.
    canvas {
      position: absolute;
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
  // Skips the dark grid backdrop, leaving the canvas truly transparent outside the token's own
  // circle — used when this is standing in for a plain portrait `<img>` (see
  // CharacterPortraitComponent) rather than showing the player a battle-map-scale preview.
  readonly transparent = input(false);
  // Draws just the cropped/zoomed face, with no ring and no pop-out — for the plain portrait
  // icon spots (party list, dashboard, character sheet, ...) where the token's decorative frame
  // doesn't belong and would otherwise shrink the face to leave room for it.
  readonly showBorder = input(true);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly image = signal<HTMLImageElement | null>(null);

  // Extra canvas room around the box, in CSS px, for a portrait thumbnail (transparent + bordered)
  // whose zoomed-in transparent face pops out over the ring (see drawTokenPopOut). The token itself
  // still fills the box at full size; this headroom just gives the popped-out art somewhere to go
  // instead of shrinking the whole token to keep it inside a square. It overflows the host, so the
  // host's layout footprint stays exactly size x size. Only the sides the border's pop-out ranges
  // reach get any. Zero for the battle-scale previews (they have open grid floor around the token)
  // and for faces that don't pop out (zoom <= 100% or opaque art).
  readonly pad = computed(() => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!this.transparent() || !this.showBorder()) return none;
    const image = this.image();
    const border = this.border();
    if (!image || border.faceScale <= 100 || !artHasTransparency(image)) return none;
    const r = this.size() / this.cells() / 2;
    const faceExtent = tokenBorderInnerRadius(r, border) * (border.faceScale / 100);
    const room = Math.max(0, faceExtent - r);
    const sides = popOutSides(border.popOut);
    return {
      top: sides.top ? room : 0,
      right: sides.right ? room : 0,
      bottom: sides.bottom ? room : 0,
      left: sides.left ? room : 0,
    };
  });

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
    effect(() =>
      this.draw(
        this.border(),
        this.image(),
        this.size(),
        this.cells(),
        this.transparent(),
        this.showBorder(),
      ),
    );
  }

  private draw(
    border: TokenBorder,
    image: HTMLImageElement | null,
    size: number,
    cells: number,
    transparent: boolean,
    showBorder: boolean,
  ) {
    const canvas = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    // Headroom around the box for popped-out art; 0 everywhere else (see pad).
    const pad = this.pad();
    canvas.width = Math.round((size + pad.left + pad.right) * dpr);
    canvas.height = Math.round((size + pad.top + pad.bottom) * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cell = size / cells;
    if (!transparent) {
      ctx.fillStyle = '#2a2620';
      ctx.fillRect(0, 0, size, size);
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
    }

    const canvasR = cell / 2;
    ctx.save();
    // Shift the token by any headroom so it still fills the box; the pop-out spills into the space
    // around it. No headroom (battle-scale preview, or no pop-out) leaves it centered.
    ctx.translate(pad.left + size / 2, pad.top + size / 2);
    if (showBorder) {
      // The token fills the box at full radius — on the battle-scale preview the popped-out face
      // bleeds onto the open grid floor; on a transparent portrait thumbnail it spills into the
      // headroom added around it (see pad). Either way nothing is clipped and the token stays full
      // size.
      drawBorderedToken(ctx, canvasR, border, image, '#4b4438');
    } else {
      // No ring to inset for, so the face fills the whole canvas circle.
      drawTokenFace(ctx, canvasR, border, image, '#4b4438', canvasR);
    }
    ctx.restore();
  }
}
