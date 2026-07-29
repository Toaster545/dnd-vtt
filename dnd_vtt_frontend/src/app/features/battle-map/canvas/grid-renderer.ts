import Konva from 'konva';

// One Konva.Shape drawing every line itself, rather than one Konva.Line per line (which can
// easily be hundreds on a large map). Every Konva Shape gets a unique hit-test color assigned
// in its constructor regardless of `listening` — on a browser with canvas anti-fingerprinting
// ("farbling"), that assignment can retry up to 10,000 times before giving up, and doing that
// for hundreds of shapes synchronously is what was freezing the tab. Collapsing to a single
// shape makes that a one-time bounded cost instead of one per gridline.
export function drawGrid(layer: Konva.Layer, w: number, h: number, cellSize: number) {
  layer.destroyChildren();
  layer.add(new Konva.Shape({
    listening: false,
    stroke: 'rgba(255,255,255,0.12)',
    strokeWidth: 1,
    sceneFunc: (context, shape) => {
      context.beginPath();
      for (let x = 0; x <= w; x += cellSize) {
        context.moveTo(x, 0);
        context.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += cellSize) {
        context.moveTo(0, y);
        context.lineTo(w, y);
      }
      context.strokeShape(shape);
    },
  }));
  layer.draw();
}
