import Konva from 'konva';
import { MapToken } from '../../../core/models/campaign.model';

// Squares reachable from `token`'s current position this turn — the 2024 rules' default
// diagonal-movement variant (a diagonal square costs the same as an orthogonal one), so the
// reachable area is a plain square bounding box, not a circle. No pathfinding/terrain: this app
// has no walls/obstacle model, so it's every square within Chebyshev range of the token.
export function renderMoveRange(
  layer: Konva.Layer,
  stage: Konva.Stage,
  cellSize: number,
  show: boolean,
  token: MapToken | null,
  range: number,
) {
  layer.destroyChildren();
  if (show && token && range > 0) {
    const centerCol = token.x + token.size / 2;
    const centerRow = token.y + token.size / 2;
    const maxCol = Math.floor(stage.width() / cellSize);
    const maxRow = Math.floor(stage.height() / cellSize);
    const minCellCol = Math.max(0, Math.floor(centerCol - range));
    const maxCellCol = Math.min(maxCol - 1, Math.ceil(centerCol + range) - 1);
    const minCellRow = Math.max(0, Math.floor(centerRow - range));
    const maxCellRow = Math.min(maxRow - 1, Math.ceil(centerRow + range) - 1);

    for (let col = minCellCol; col <= maxCellCol; col++) {
      for (let row = minCellRow; row <= maxCellRow; row++) {
        layer.add(new Konva.Rect({
          x: col * cellSize, y: row * cellSize, width: cellSize, height: cellSize,
          fill: 'rgba(76, 175, 130, 0.25)',
        }));
      }
    }
  }
  layer.draw();
}
