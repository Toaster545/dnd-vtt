import { distanceToSegment, pointInPolygon, Segment, visibilityPolygon } from './visibility';

describe('visibilityPolygon', () => {
  const origin = { x: 0, y: 0 };

  it('returns null when no wall is within range', () => {
    const far: Segment = { a: { x: 100, y: -5 }, b: { x: 100, y: 5 } };
    expect(visibilityPolygon(origin, 10, [far])).toBeNull();
  });

  it('shadows the area behind a wall', () => {
    const wall: Segment = { a: { x: 5, y: -3 }, b: { x: 5, y: 3 } };
    const poly = visibilityPolygon(origin, 20, [wall])!;
    expect(poly).not.toBeNull();
    expect(pointInPolygon({ x: 3, y: 0 }, poly)).toBe(true); // in front of the wall
    expect(pointInPolygon({ x: 10, y: 0 }, poly)).toBe(false); // directly behind it
    expect(pointInPolygon({ x: -10, y: 0 }, poly)).toBe(true); // opposite side, unobstructed
    expect(pointInPolygon({ x: 10, y: 10 }, poly)).toBe(true); // past the wall's end
  });

  it('keeps light inside a closed room', () => {
    const room: Segment[] = [
      { a: { x: -4, y: -4 }, b: { x: 4, y: -4 } },
      { a: { x: 4, y: -4 }, b: { x: 4, y: 4 } },
      { a: { x: 4, y: 4 }, b: { x: -4, y: 4 } },
      { a: { x: -4, y: 4 }, b: { x: -4, y: -4 } },
    ];
    const poly = visibilityPolygon(origin, 50, room)!;
    expect(pointInPolygon({ x: 3, y: 3 }, poly)).toBe(true);
    for (const outside of [
      { x: 6, y: 0 },
      { x: 0, y: -6 },
      { x: 10, y: 10 },
    ]) {
      expect(pointInPolygon(outside, poly)).toBe(false);
    }
  });

  it('lets light through a gap in a wall', () => {
    const walls: Segment[] = [
      { a: { x: 5, y: -10 }, b: { x: 5, y: -1 } },
      { a: { x: 5, y: 1 }, b: { x: 5, y: 10 } },
    ];
    const poly = visibilityPolygon(origin, 30, walls)!;
    expect(pointInPolygon({ x: 15, y: 0 }, poly)).toBe(true); // through the doorway
    expect(pointInPolygon({ x: 15, y: 8 }, poly)).toBe(false); // behind the wall
  });
});

describe('distanceToSegment', () => {
  const seg: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };

  it('measures perpendicular distance within the segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, seg)).toBeCloseTo(3);
  });

  it('measures to the nearest endpoint beyond the segment', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, seg)).toBeCloseTo(5);
  });
});
