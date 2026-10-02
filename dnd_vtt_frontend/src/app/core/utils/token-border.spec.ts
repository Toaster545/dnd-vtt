import { TokenBorder } from '../models/token-border.model';
import {
  DEFAULT_TOKEN_BORDER,
  drawTokenFace,
  drawTokenPopOut,
  normalizeTokenBorder,
  strokeTokenBorder,
  tokenBorderInnerRadius,
} from './token-border';

function fakeContext() {
  const calls = {
    arcs: [] as number[],
    widths: [] as number[],
    dashes: [] as number[][],
    styles: [] as unknown[],
    stops: [] as [number, string][],
    gradients: [] as number[][],
    fills: [] as unknown[],
    images: [] as number[][],
    clips: 0,
    rects: [] as number[][],
  };
  let fillStyle: unknown = '';
  let lineWidth = 0;
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    rect(...rect: number[]) {
      calls.rects.push(rect);
    },
    clip() {
      calls.clips++;
    },
    fill() {
      calls.fills.push(fillStyle);
    },
    drawImage(_image: unknown, ...rect: number[]) {
      calls.images.push(rect);
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    lineDashOffset: 0,
    stroke() {
      calls.widths.push(lineWidth);
    },
    arc(_x: number, _y: number, radius: number) {
      calls.arcs.push(radius);
    },
    setLineDash(dash: number[]) {
      calls.dashes.push(dash);
    },
    createRadialGradient: (...args: number[]) => {
      calls.gradients.push(args);
      return {
        addColorStop: (offset: number, color: string) => calls.stops.push([offset, color]),
      };
    },
    set lineWidth(value: number) {
      lineWidth = value;
    },
    set strokeStyle(value: unknown) {
      calls.styles.push(value);
    },
    lineCap: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('token border', () => {
  it('normalizes valid borders and rejects anything else', () => {
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, color: '#ABCDEF' })).toEqual({
      ...DEFAULT_TOKEN_BORDER,
      color: '#abcdef',
    });
    expect(normalizeTokenBorder(null)).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, color: 'url(x)' })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, width: 'huge' })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, width: 0 })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, width: 3.5 })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, width: 'thick' })?.width).toBe(8);
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, gradientColor: 'red' })).toBeNull();
    expect(
      normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, gradientColor: '#EC4899' })?.gradientColor,
    ).toBe('#ec4899');
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, material: 'glass' })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, faceScale: 79 })).toBeNull();
    expect(normalizeTokenBorder({ ...DEFAULT_TOKEN_BORDER, backgroundColor: 'red' })).toBeNull();
  });

  it('fills in defaults for borders saved before background/material/zoom existed', () => {
    expect(normalizeTokenBorder({ color: '#e05252', width: 3, pattern: 'dotted' })).toEqual({
      ...DEFAULT_TOKEN_BORDER,
      color: '#e05252',
      width: 3,
      pattern: 'dotted',
    });
  });

  it('fills the background behind the portrait and scales the art by the zoom', () => {
    const border: TokenBorder = {
      ...DEFAULT_TOKEN_BORDER,
      backgroundColor: '#1f2937',
      faceScale: 80,
    };
    const faceR = tokenBorderInnerRadius(30, border);
    const { ctx, calls } = fakeContext();
    drawTokenFace(ctx, 30, border, {} as CanvasImageSource, '#ff0000');
    expect(calls.fills).toEqual(['#1f2937']);
    expect(calls.clips).toBe(1);
    const [x, , w] = calls.images[0];
    expect(w).toBeCloseTo(faceR * 2 * 0.8);
    expect(x).toBeCloseTo(-faceR * 0.8);

    // Without art yet and no background, the fallback color stands in for the face.
    const empty = fakeContext();
    drawTokenFace(empty.ctx, 30, DEFAULT_TOKEN_BORDER, null, '#ff0000');
    expect(empty.calls.fills).toEqual(['#ff0000']);
    expect(empty.calls.images).toEqual([]);
  });

  it('redraws only the top half of a zoomed portrait over the ring', () => {
    const border: TokenBorder = { ...DEFAULT_TOKEN_BORDER, faceScale: 140 };
    const size = tokenBorderInnerRadius(30, border) * 1.4;
    const { ctx, calls } = fakeContext();
    drawTokenPopOut(ctx, 30, border, {} as CanvasImageSource);
    // Clip spans the image's full width but stops at the token's center line.
    const [x, y, w, h] = calls.rects[0];
    expect([x, y, w, h].map((v) => +v.toFixed(6))).toEqual(
      [-size, -size, size * 2, size].map((v) => +v.toFixed(6)),
    );
    expect(y + h).toBeCloseTo(0);
    expect(calls.images[0][2]).toBeCloseTo(size * 2);
  });

  it('adds studs only to a continuous studded ring', () => {
    const studded = fakeContext();
    strokeTokenBorder(studded.ctx, 30, { ...DEFAULT_TOKEN_BORDER, material: 'studded' });
    expect(studded.calls.fills.length).toBeGreaterThan(0);
    expect(studded.calls.fills.length % 3).toBe(0);

    const dotted = fakeContext();
    strokeTokenBorder(dotted.ctx, 30, {
      ...DEFAULT_TOKEN_BORDER,
      material: 'studded',
      pattern: 'dotted',
    });
    expect(dotted.calls.fills).toEqual([]);
  });

  it('keeps the ring inside the token and clips the face to its center line', () => {
    const r = 30;
    for (const width of [1, 5, 10]) {
      const border: TokenBorder = { ...DEFAULT_TOKEN_BORDER, width };
      const { ctx, calls } = fakeContext();
      strokeTokenBorder(ctx, r, border);
      expect(calls.arcs[0]).toBe(tokenBorderInnerRadius(r, border));
      expect(calls.arcs[0] + calls.widths[0] / 2).toBeCloseTo(r - 1);
    }
  });

  it('draws two rings for double and a whole number of dashes around the circle', () => {
    const double = fakeContext();
    strokeTokenBorder(double.ctx, 30, { ...DEFAULT_TOKEN_BORDER, pattern: 'double' });
    expect(double.calls.arcs).toHaveLength(2);
    expect(double.calls.arcs[1]).toBeLessThan(double.calls.arcs[0]);

    const dashed = fakeContext();
    strokeTokenBorder(dashed.ctx, 30, { ...DEFAULT_TOKEN_BORDER, pattern: 'dashed' });
    const [dash, gap] = dashed.calls.dashes[0];
    const count = (2 * Math.PI * dashed.calls.arcs[0]) / (dash + gap);
    expect(count).toBeCloseTo(Math.round(count));
  });

  it('blends from the outer color to the inner color across the ring band', () => {
    const plain = fakeContext();
    strokeTokenBorder(plain.ctx, 30, DEFAULT_TOKEN_BORDER);
    expect(plain.calls.styles).toEqual([DEFAULT_TOKEN_BORDER.color]);
    expect(plain.calls.stops).toEqual([]);

    const gradient = fakeContext();
    strokeTokenBorder(gradient.ctx, 30, { ...DEFAULT_TOKEN_BORDER, gradientColor: '#3b82f6' });
    expect(gradient.calls.stops).toEqual([
      [0, '#3b82f6'],
      [1, DEFAULT_TOKEN_BORDER.color],
    ]);
    const [, , inner, , , outer] = gradient.calls.gradients[0];
    expect(inner).toBeCloseTo(gradient.calls.arcs[0] - gradient.calls.widths[0] / 2);
    expect(outer).toBeCloseTo(29);
  });
});
