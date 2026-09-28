import { UniversalVTTData } from '../models/campaign.model';
import { wallsFromUniversalVtt } from './uvtt-walls';

function uvtt(overrides: Partial<UniversalVTTData>): UniversalVTTData {
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 100 },
    portals: [],
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: [],
    image: '',
    line_of_sight: [],
    objects_line_of_sight: [],
    ...overrides,
  };
}

describe('wallsFromUniversalVtt', () => {
  it('splits each polyline into one wall per consecutive point pair', () => {
    const walls = wallsFromUniversalVtt(
      uvtt({
        line_of_sight: [
          [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 3 },
          ],
        ],
        objects_line_of_sight: [
          [
            { x: 6, y: 6 },
            { x: 7, y: 6 },
          ],
        ],
      }),
    );
    expect(walls).toEqual([
      { x1: 0, y1: 0, x2: 4, y2: 0 },
      { x1: 4, y1: 0, x2: 4, y2: 3 },
      { x1: 6, y1: 6, x2: 7, y2: 6 },
    ]);
  });

  it('shifts by the map origin', () => {
    const walls = wallsFromUniversalVtt(
      uvtt({
        resolution: {
          map_origin: { x: 2, y: 1 },
          map_size: { x: 10, y: 10 },
          pixels_per_grid: 100,
        },
        line_of_sight: [
          [
            { x: 2, y: 1 },
            { x: 5, y: 1 },
          ],
        ],
      }),
    );
    expect(walls).toEqual([{ x1: 0, y1: 0, x2: 3, y2: 0 }]);
  });

  it('turns closed doors into walls and skips open ones', () => {
    const door = (closed: boolean) => ({
      position: { x: 0, y: 0 },
      rotation: 0,
      closed,
      freestanding: false,
      bounds: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ],
    });
    expect(wallsFromUniversalVtt(uvtt({ portals: [door(true), door(false)] }))).toEqual([
      { x1: 1, y1: 2, x2: 2, y2: 2 },
    ]);
  });
});
