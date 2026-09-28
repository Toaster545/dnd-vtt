// Pure 2D line-of-sight geometry for light-blocking walls — no Konva, so it's unit-testable and
// reusable for anything else that needs "what can this point see" later (e.g. token vision).
// Everything here works in one consistent coordinate space; the lighting renderer feeds it
// canvas pixels.

export interface Point {
  x: number;
  y: number;
}
export interface Segment {
  a: Point;
  b: Point;
}

// Angular nudge either side of each wall endpoint, so a ray can slip just past a corner and
// hit whatever is behind it instead of stopping dead on the corner itself.
const ANGLE_EPSILON = 1e-5;

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// Distance along the ray origin + t·dir to where it crosses `seg`, or null if it misses.
function raySegmentHit(origin: Point, dx: number, dy: number, seg: Segment): number | null {
  const sx = seg.b.x - seg.a.x;
  const sy = seg.b.y - seg.a.y;
  const denom = cross(dx, dy, sx, sy);
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const ox = seg.a.x - origin.x;
  const oy = seg.a.y - origin.y;
  const t = cross(ox, oy, sx, sy) / denom;
  const u = cross(ox, oy, dx, dy) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

// True if `seg` could touch the axis-aligned square of half-size `r` around `c` — a cheap
// bounding-box reject, so a light only ray-casts against the walls actually near it.
function segmentNearSquare(seg: Segment, c: Point, r: number): boolean {
  return (
    Math.max(seg.a.x, seg.b.x) >= c.x - r &&
    Math.min(seg.a.x, seg.b.x) <= c.x + r &&
    Math.max(seg.a.y, seg.b.y) >= c.y - r &&
    Math.min(seg.a.y, seg.b.y) <= c.y + r
  );
}

// The region visible from `origin` out to `radius`, as a polygon (points in angular order) that
// walls cut shadows out of. Classic endpoint ray-cast: shoot a ray at every nearby wall endpoint
// (plus one just either side of it) and keep the nearest hit along each. A square just outside
// the radius bounds the rays, so the polygon always closes; callers clip a circular light to it,
// so the square's corners never show. Returns null when no wall is in range — nothing to clip.
export function visibilityPolygon(origin: Point, radius: number, walls: Segment[]): Point[] | null {
  if (radius <= 0) return null;
  const nearby = walls.filter((w) => segmentNearSquare(w, origin, radius));
  if (!nearby.length) return null;

  const r = radius + 1;
  const tl = { x: origin.x - r, y: origin.y - r };
  const tr = { x: origin.x + r, y: origin.y - r };
  const br = { x: origin.x + r, y: origin.y + r };
  const bl = { x: origin.x - r, y: origin.y + r };
  const segments: Segment[] = [
    ...nearby,
    { a: tl, b: tr },
    { a: tr, b: br },
    { a: br, b: bl },
    { a: bl, b: tl },
  ];

  const angles: number[] = [];
  for (const seg of segments) {
    for (const p of [seg.a, seg.b]) {
      const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON);
    }
  }
  angles.sort((a, b) => a - b);

  const polygon: Point[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearest = Infinity;
    for (const seg of segments) {
      const t = raySegmentHit(origin, dx, dy, seg);
      if (t !== null && t < nearest) nearest = t;
    }
    if (nearest === Infinity) continue;
    polygon.push({ x: origin.x + dx * nearest, y: origin.y + dy * nearest });
  }
  return polygon;
}

// Shortest distance from `p` to segment `seg` — used by the wall eraser to find what's under
// the pointer.
export function distanceToSegment(p: Point, seg: Segment): number {
  const sx = seg.b.x - seg.a.x;
  const sy = seg.b.y - seg.a.y;
  const lenSq = sx * sx + sy * sy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - seg.a.x) * sx + (p.y - seg.a.y) * sy) / lenSq));
  return Math.hypot(p.x - (seg.a.x + t * sx), p.y - (seg.a.y + t * sy));
}

// Even-odd point-in-polygon test.
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
