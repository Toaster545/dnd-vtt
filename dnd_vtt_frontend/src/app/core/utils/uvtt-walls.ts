import { MapWall, UniversalVTTData } from '../models/campaign.model';

// Light-blocking walls from a Universal VTT (.dd2vtt) export, in the same grid units the battle
// map uses. `line_of_sight` (walls) and `objects_line_of_sight` (pillars, furniture flagged to
// block sight) are polylines — each consecutive pair of points becomes one wall. Closed doors
// (`portals`) come in as walls too so light doesn't leak through a shut doorway; the DM erases a
// door's wall to "open" it. Coordinates are shifted by `map_origin` so they line up with the
// exported image's top-left corner.
export function wallsFromUniversalVtt(data: UniversalVTTData): MapWall[] {
  const ox = data.resolution?.map_origin?.x ?? 0;
  const oy = data.resolution?.map_origin?.y ?? 0;
  const walls: MapWall[] = [];
  const addPolyline = (points: { x: number; y: number }[] | undefined) => {
    if (!Array.isArray(points)) return;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) continue;
      if (a.x === b.x && a.y === b.y) continue;
      walls.push({ x1: a.x - ox, y1: a.y - oy, x2: b.x - ox, y2: b.y - oy });
    }
  };
  [...(data.line_of_sight ?? []), ...(data.objects_line_of_sight ?? [])].forEach(addPolyline);
  for (const portal of data.portals ?? []) {
    if (portal.closed !== false) addPolyline(portal.bounds);
  }
  return walls;
}
