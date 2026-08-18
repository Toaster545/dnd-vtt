import Konva from 'konva';

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const WHEEL_SCALE_BY = 1.05;
const BUTTON_SCALE_BY = 1.2;

// Reserve the middle mouse button for camera panning only (see the `mousedown` handler below) —
// left button (0) stays the only button that starts a native Konva drag, so middle-click never
// also drags whatever token or the stage happens to be under the pointer via Konva's own built-in
// dragButtons: [0, 1] default. This is a module-level Konva setting, so it applies everywhere
// Konva is used in the app; the battle map is the only place that is.
Konva.dragButtons = [0];

interface Point { x: number; y: number; }

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function center(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Owns the stage-level pan/zoom/rotate view transform — a viewport control layered on top of the
// stage, entirely separate from the fit-to-container `cellSize` scale every other renderer
// (grid/tokens/fog/measurement) works in. Because it's applied to the Stage node itself rather
// than to individual layers, all layers move/scale/rotate together and stay aligned; pointer math
// elsewhere (cellUnderPointer, pointerToGridPos) recovers world coordinates via
// stage.getRelativePointerPosition(), which already inverts this transform.
export class StageView {
  private pinchLastDist = 0;
  private pinchLastCenter: Point | null = null;
  private homePosition: Point = { x: 0, y: 0 };

  // Tracks an in-progress middle-button pan; null when none is active.
  private middlePanFrom: Point | null = null;
  private middlePanOrigin: Point = { x: 0, y: 0 };
  private readonly onMiddlePanMove = (e: MouseEvent) => {
    if (!this.middlePanFrom) return;
    this.stage.position({
      x: this.middlePanOrigin.x + (e.clientX - this.middlePanFrom.x),
      y: this.middlePanOrigin.y + (e.clientY - this.middlePanFrom.y),
    });
    this.stage.batchDraw();
  };
  private readonly onMiddlePanEnd = () => this.endMiddlePan();

  constructor(private stage: Konva.Stage, private canPan: () => boolean) {
    this.stage.draggable(canPan());
    stage.on('wheel', e => this.onWheel(e));
    stage.on('touchmove', e => this.onTouchMove(e));
    stage.on('touchend touchcancel', () => this.onTouchEnd());
    // Middle-click always pans the camera, regardless of which tool (fog brush, measure, place
    // torch) is currently armed for the left button — the DM doesn't have to switch back to the
    // Select/move tool just to reposition the view mid-task. Listened for at the stage level (not
    // gated by `canPan`/`draggable`) so it works no matter what's currently under the pointer.
    stage.on('mousedown', e => this.startMiddlePan(e));
  }

  private startMiddlePan(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button !== 1) return;
    e.evt.preventDefault(); // stops the browser's middle-click autoscroll marker
    if (this.stage.isDragging()) this.stage.stopDrag();
    this.middlePanFrom = { x: e.evt.clientX, y: e.evt.clientY };
    this.middlePanOrigin = { ...this.stage.position() };
    // Bound to window, not the stage, so the pan keeps tracking even if the cursor slides off the
    // canvas mid-drag, and reliably ends on mouseup wherever that happens to land.
    window.addEventListener('mousemove', this.onMiddlePanMove);
    window.addEventListener('mouseup', this.onMiddlePanEnd);
  }

  private endMiddlePan() {
    this.middlePanFrom = null;
    window.removeEventListener('mousemove', this.onMiddlePanMove);
    window.removeEventListener('mouseup', this.onMiddlePanEnd);
  }

  // Called from the component's ngOnDestroy, ahead of stage.destroy() — the window listeners
  // above are only otherwise removed by their own mouseup, so a teardown mid-drag would leak them.
  destroy() {
    this.endMiddlePan();
  }

  // The letterbox offset that centers the map image in the container — used both to place the
  // map on first load and as the target for the "reset view" button, so resetting never yanks
  // the map back to the top-left corner instead of its centered default.
  setHome(position: Point) {
    this.homePosition = position;
  }

  centerOnHome() {
    this.stage.position(this.homePosition);
    this.stage.batchDraw();
  }

  centerOn(worldPoint: Point) {
    this.stage.position(this.screenPositionFor(worldPoint, this.screenCenter(), this.stage.scaleX()));
    this.stage.batchDraw();
  }

  setPannable(canPan: boolean) {
    if (this.stage.isDragging() && !canPan) this.stage.stopDrag();
    this.stage.draggable(canPan);
  }

  zoomIn() {
    this.zoomAtPoint(this.screenCenter(), this.stage.scaleX() * BUTTON_SCALE_BY);
  }

  zoomOut() {
    this.zoomAtPoint(this.screenCenter(), this.stage.scaleX() / BUTTON_SCALE_BY);
  }

  rotateBy(deg: number) {
    // Re-anchored on the screen center so rotating doesn't fling the map out of view.
    const worldCenter = this.screenToWorld(this.screenCenter());
    this.stage.rotation(this.stage.rotation() + deg);
    this.stage.position(this.screenPositionFor(worldCenter, this.screenCenter(), this.stage.scaleX()));
    this.stage.batchDraw();
  }

  resetView() {
    this.stage.position(this.homePosition);
    this.stage.scale({ x: 1, y: 1 });
    this.stage.rotation(0);
    this.stage.batchDraw();
  }

  private onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = this.stage.scaleX();
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * WHEEL_SCALE_BY : oldScale / WHEEL_SCALE_BY;
    this.zoomAtPoint(pointer, newScale);
  }

  private onTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];
    if (!touch1 || !touch2) return;
    e.evt.preventDefault();
    if (this.stage.isDragging()) this.stage.stopDrag();

    const rect = this.stage.container().getBoundingClientRect();
    const p1 = { x: touch1.clientX - rect.left, y: touch1.clientY - rect.top };
    const p2 = { x: touch2.clientX - rect.left, y: touch2.clientY - rect.top };
    const dist = distance(p1, p2);
    const mid = center(p1, p2);

    if (!this.pinchLastCenter) {
      this.pinchLastCenter = mid;
      this.pinchLastDist = dist;
      return;
    }
    this.zoomAtPoint(mid, this.stage.scaleX() * (dist / this.pinchLastDist));
    this.pinchLastDist = dist;
    this.pinchLastCenter = mid;
  }

  private onTouchEnd() {
    this.pinchLastCenter = null;
    this.pinchLastDist = 0;
  }

  private zoomAtPoint(screenPoint: Point, newScaleRaw: number) {
    const newScale = clampScale(newScaleRaw);
    if (newScale === this.stage.scaleX()) return;
    const worldPoint = this.screenToWorld(screenPoint);
    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position(this.screenPositionFor(worldPoint, screenPoint, newScale));
    this.stage.batchDraw();
  }

  // Where the stage's x/y must be so that `worldPoint` renders at `screenPoint` given `scale` and
  // the stage's current rotation — used to keep a fixed point under the cursor/center through a
  // zoom or rotation change instead of the view jumping.
  private screenPositionFor(worldPoint: Point, screenPoint: Point, scale: number): Point {
    const angle = (this.stage.rotation() * Math.PI) / 180;
    const sx = worldPoint.x * scale, sy = worldPoint.y * scale;
    const rx = sx * Math.cos(angle) - sy * Math.sin(angle);
    const ry = sx * Math.sin(angle) + sy * Math.cos(angle);
    return { x: screenPoint.x - rx, y: screenPoint.y - ry };
  }

  private screenToWorld(point: Point): Point {
    return this.stage.getAbsoluteTransform().copy().invert().point(point);
  }

  private screenCenter(): Point {
    return { x: this.stage.width() / 2, y: this.stage.height() / 2 };
  }
}
