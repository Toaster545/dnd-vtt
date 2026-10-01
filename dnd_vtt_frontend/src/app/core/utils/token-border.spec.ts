import { TokenBorder } from '../models/token-border.model';
import {
  DEFAULT_TOKEN_BORDER,
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
  };
  let lineWidth = 0;
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
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
