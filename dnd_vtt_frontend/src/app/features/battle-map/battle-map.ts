import {
  Component, ElementRef, inject, input, output, signal, computed, effect, OnInit, AfterViewInit, OnDestroy, ViewChild
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BattleMapService } from '../../core/services/battle-map.service';
import { AuthService } from '../../core/services/auth.service';
import { MapToken, BattleMap, PlacingEntity, MeasureShape, Measurement } from '../../core/models/campaign.model';
import { ConfirmService } from '../../shared/confirm.service';
import { ResizeHandleDirective } from '../../shared/directives/resize-handle.directive';

@Component({
  selector: 'app-battle-map',
  imports: [RouterLink, FormsModule, MatIconModule, MatTooltipModule, ResizeHandleDirective],
  templateUrl: './battle-map.html',
  styleUrl: './battle-map.scss',
})
export class BattleMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stageContainer') stageContainer!: ElementRef<HTMLDivElement>;

  // When embedded (e.g. in the DM's encounter play view), a specific map is passed in directly;
  // otherwise falls back to the `/battle-map/:id` route param. `embedded` hides the page header.
  readonly mapIdInput = input<string | undefined>(undefined);
  readonly embedded   = input(false);
  // Armed from an encounter's roster sidebar; when set, clicking the map places a token built
  // from it instead of the manual `newToken` form. Not auto-cleared — the parent controls
  // arming/disarming so the DM can drop several of the same entry with repeated clicks.
  readonly placingEntity = input<PlacingEntity | null>(null);
  // Live HP for character tokens, keyed by character_id (it lives on the Character record, not
  // the token). Fed from the DM's already-loaded roster, or from encounter presence on the
  // player's view — hence party-visible here, unlike monster HP which stays admin-only.
  readonly characterHp = input<Record<string, { hp: number; max_hp: number }>>({});
  // Id of the token whose turn it currently is (from the embedding parent's Encounter record) —
  // drives the highlight ring drawn in renderTokens() and the turn-order row highlight below.
  readonly currentTurnTokenId = input<string | null>(null);
  // Fired when an already-placed token is clicked, so an embedding parent can show its stat block/HP.
  readonly tokenClicked = output<MapToken>();
  // Fired whenever the resolved current-turn token changes, so an embedding parent — which only
  // has the id above — can show the token's name (e.g. a "X's Turn" header label) without having
  // to duplicate token state of its own.
  readonly currentTurnTokenChanged = output<MapToken | null>();

  mapService = inject(BattleMapService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);

  map = signal<BattleMap | null>(null);
  tokens = signal<MapToken[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  newToken = { label: 'Token', color: '#e74c3c', size: 1, is_player: false };

  // Right-hand sidebar width — the DM's Place a Token/Turn Order panel or the player's read-only
  // Turn Order panel, whichever is showing (they're mutually exclusive, so one signal covers
  // both). Drag-resizable via the handle between it and the map; that handle sits on the
  // sidebar's left edge, so dragging right shrinks it.
  rightAsideWidth = signal(256);

  onRightAsideResize(dx: number) {
    this.rightAsideWidth.update(w => Math.min(420, Math.max(220, w - dx)));
  }

  // Roll20-style ruler/cone/sphere — null is the normal select/place/drag mode. Available to
  // every viewer (DM and players), not gated by auth.isAdmin(). Toggling this suspends token
  // placement/dragging (see the `stage.on('click tap', ...)` guard and renderTokens()'s
  // `draggable` below) while a measure tool is active.
  activeMeasureTool = signal<MeasureShape | null>(null);

  toggleMeasureTool(shape: MeasureShape) {
    this.activeMeasureTool.update(current => current === shape ? null : shape);
  }

  // The token list re-sorted by initiative, highest first, with unrolled tokens sorted last.
  turnOrder = computed(() => {
    return [...this.tokens()].sort((a, b) => {
      if (a.initiative == null && b.initiative == null) return 0;
      if (a.initiative == null) return 1;
      if (b.initiative == null) return -1;
      return b.initiative - a.initiative;
    });
  });

  currentTurnToken = computed(() =>
    this.tokens().find(t => t.id === this.currentTurnTokenId()) ?? null
  );

  private stage?: Konva.Stage;
  private mapLayer?: Konva.Layer;
  private tokenLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;
  private measureLayer?: Konva.Layer;
  private konvaImg?: Konva.Image;
  private img?: HTMLImageElement;
  private gridSize = 50;
  // Watches the canvas's own container rather than the window, since dragging either flanking
  // sidebar's resize handle (see ResizeHandleDirective) resizes this container without ever
  // firing a window resize event.
  private resizeObserver?: ResizeObserver;
  private tokenSub?: Subscription;
  private measureSub?: Subscription;
  // This viewer's own in-progress drag — rendered instantly, no round trip. Cleared on mouseup.
  private localMeasurement: Measurement | null = null;
  // Everyone else's live measurements on this map, keyed by their socket id.
  private remoteMeasurements = new Map<string, Measurement>();
  private lastMeasureBroadcast = 0;
  private mapId!: string;
  private routeMapId: string | null = null;
  private viewReady = signal(false);
  private loadedMapId: string | null = null;
  private cellSize = 0;
  // Mirrors the `tokens` signal as a plain field so the characterHp redraw effect below can read
  // it without also re-triggering on every token change (the socket subscription already redraws directly).
  private lastTokens: MapToken[] = [];

  constructor() {
    // Triggers the load once both the input/route map id and the view are ready, whichever
    // settles last — avoids the old ngOnInit/ngAfterViewInit split where an async fetch could
    // finish after ngAfterViewInit's one-shot check had already run.
    effect(() => {
      const ready = this.viewReady();
      const id = this.mapIdInput() ?? this.routeMapId ?? '';
      if (!ready || !id || id === this.loadedMapId) return;
      this.loadedMapId = id;
      this.loadMap(id);
    });

    // A character's HP changing (e.g. the DM adjusting it from the roster's character sheet), the
    // current turn changing, or the measure tool being toggled (which flips whether tokens are
    // draggable) doesn't touch the token list itself, so each needs its own redraw trigger.
    effect(() => {
      this.characterHp();
      this.currentTurnTokenId();
      this.activeMeasureTool();
      if (this.tokenLayer && this.cellSize) {
        this.renderTokens(this.lastTokens, this.cellSize);
      }
    });

    // Lets an embedding parent (which only holds the current-turn token *id*) resolve it to the
    // actual token for display, e.g. a "X's Turn" header label.
    effect(() => {
      this.currentTurnTokenChanged.emit(this.currentTurnToken());
    });
  }

  ngOnInit() {
    this.routeMapId = this.route.snapshot.paramMap.get('id');
  }

  ngAfterViewInit() {
    this.viewReady.set(true);
  }

  ngOnDestroy() {
    this.tokenSub?.unsubscribe();
    this.measureSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
  }

  private async loadMap(id: string) {
    this.mapId = id;
    this.loading.set(true);
    this.error.set(null);
    this.tokenSub?.unsubscribe();
    this.tokenSub = undefined;
    this.measureSub?.unsubscribe();
    this.measureSub = undefined;
    this.localMeasurement = null;
    this.remoteMeasurements.clear();
    // #stageContainer is a stable element reused across map loads (see the template comment), so
    // the observer from a previous map must be torn down before buildStage() attaches a new one —
    // otherwise every map switch would stack another observer on the same element.
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.stage?.destroy();
    this.stage = undefined;

    try {
      const map = await this.mapService.getMap(id);
      this.map.set(map);
      this.initStage();
    } catch (e: any) {
      this.error.set(e.message);
      this.loading.set(false);
    }
  }

  private initStage() {
    const map = this.map()!;
    this.gridSize = map.grid_size || 50;

    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.buildStage();
    };
    // Without this, a broken/missing image URL (moved upload, wrong host, etc.) leaves the view
    // stuck on the loading spinner forever with no indication anything went wrong.
    img.onerror = () => {
      this.error.set('Failed to load the map image.');
      this.loading.set(false);
    };
    img.src = map.image_url;
  }

  // Creates the Konva stage/layers once the image has decoded, then hands off to reflow() for
  // the actual size-dependent layout — both the initial one and every one after, so there's a
  // single source of truth for "given the current container size, what should this look like."
  private buildStage() {
    const container = this.stageContainer.nativeElement;
    // The container can still be laid out at zero size the instant the image finishes decoding
    // (e.g. an ancestor flex chain that hasn't stretched yet) — proceeding would leave `cellSize`
    // at 0, and drawGrid's `for (x += cellSize)` loop would then spin forever with x stuck at 0,
    // hanging the tab. Retrying on the next frame costs nothing once real layout lands, and never
    // blocks the main thread the way that loop would.
    if (!container.clientWidth || !container.clientHeight) {
      requestAnimationFrame(() => this.buildStage());
      return;
    }

    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.mapLayer = new Konva.Layer();
    this.gridLayer = new Konva.Layer();
    this.tokenLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer();
    this.stage.add(this.mapLayer, this.gridLayer, this.tokenLayer, this.measureLayer);
    // Purely visual — the ruler/cone/sphere itself is never clicked or dragged, only the stage's
    // own mousedown/mousemove/mouseup handlers below drive it.
    this.measureLayer.listening(false);

    // Grid lines are purely decorative — nothing on this layer is ever clicked or dragged.
    // Konva otherwise assigns every shape a unique hit-test color, and a grid can easily be
    // hundreds of lines; browsers with canvas anti-fingerprinting ("farbling", e.g. Firefox's
    // resistFingerprinting, or Brave) perturb the hit-canvas pixels enough that Konva can't
    // read back the color it just assigned, so it keeps retrying and warning per shape — which
    // can make the whole board janky or unresponsive. Marking the layer non-listening skips hit
    // registration for all of it.
    this.gridLayer.listening(false);

    this.konvaImg = new Konva.Image({ image: this.img!, x: 0, y: 0, width: 0, height: 0 });
    this.mapLayer.add(this.konvaImg);

    this.stage.on('click tap', (e) => {
      if (e.target === this.konvaImg && this.auth.isAdmin() && !this.activeMeasureTool()) {
        const pos = this.stage!.getPointerPosition()!;
        const col = Math.floor(pos.x / this.cellSize);
        const row = Math.floor(pos.y / this.cellSize);
        this.addTokenAt(col, row, this.cellSize);
      }
    });

    this.stage.on('mousedown touchstart', () => {
      const shape = this.activeMeasureTool();
      if (!shape) return;
      const { col, row } = this.snapToGrid();
      this.localMeasurement = { shape, originCol: col, originRow: row, pointCol: col, pointRow: row };
    });

    this.stage.on('mousemove touchmove', () => {
      if (!this.localMeasurement) return;
      const { col, row } = this.snapToGrid();
      this.localMeasurement = { ...this.localMeasurement, pointCol: col, pointRow: row };
      this.renderMeasurements();

      // Throttled so a raw mousemove stream doesn't flood the socket.
      const now = Date.now();
      if (now - this.lastMeasureBroadcast > 50) {
        this.lastMeasureBroadcast = now;
        this.mapService.sendMeasure(this.mapId, this.localMeasurement);
      }
    });

    this.stage.on('mouseup touchend', () => {
      if (!this.localMeasurement) return;
      this.localMeasurement = null;
      this.renderMeasurements();
      this.mapService.sendMeasure(this.mapId, null);
    });

    this.tokenSub = this.mapService.watchTokens(this.mapId).subscribe(tokens => {
      this.tokens.set(tokens);
      this.lastTokens = tokens;
      this.renderTokens(tokens, this.cellSize);
    });

    this.measureSub = this.mapService.watchMeasurements(this.mapId).subscribe(({ senderId, measurement }) => {
      if (measurement) this.remoteMeasurements.set(senderId, measurement);
      else this.remoteMeasurements.delete(senderId);
      this.renderMeasurements();
    });

    this.resizeObserver = new ResizeObserver(() => this.reflow());
    this.resizeObserver.observe(container);

    this.reflow();
    this.loading.set(false);
  }

  // Recomputes scale from the container's current size and redraws everything that depends on
  // it. Called once right after the stage is built, and again on every container resize (a
  // no-op if the container is momentarily at zero size — the observer fires again once it isn't).
  private reflow() {
    const container = this.stageContainer.nativeElement;
    const img = this.img;
    if (!this.stage || !img || !container.clientWidth || !container.clientHeight) return;

    const scale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    this.cellSize = this.gridSize * scale;

    this.stage.width(container.clientWidth);
    this.stage.height(container.clientHeight);
    this.konvaImg!.width(w);
    this.konvaImg!.height(h);

    this.drawGrid(w, h, this.cellSize);
    this.renderTokens(this.lastTokens, this.cellSize);
  }

  private drawGrid(w: number, h: number, cellSize: number) {
    const layer = this.gridLayer!;
    // reflow() calls this again on every resize, so the previous frame's shape has to go first —
    // same reasoning as renderTokens()'s own destroyChildren() below.
    layer.destroyChildren();
    // One Konva.Shape drawing every line itself, rather than one Konva.Line per line (which can
    // easily be hundreds on a large map). Every Konva Shape gets a unique hit-test color assigned
    // in its constructor regardless of `listening` — on a browser with canvas anti-fingerprinting
    // ("farbling"), that assignment can retry up to 10,000 times before giving up, and doing that
    // for hundreds of shapes synchronously is what was freezing the tab. Collapsing to a single
    // shape makes that a one-time bounded cost instead of one per gridline.
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

  private renderTokens(tokens: MapToken[], cellSize: number) {
    const layer = this.tokenLayer!;
    layer.destroyChildren();
    for (const token of tokens) {
      const r = (cellSize * token.size) / 2;
      const cx = token.x * cellSize + r;
      const cy = token.y * cellSize + r;
      const label = token.label.substring(0, 3).toUpperCase();
      const labelFontSize = r * 0.7;
      // Character HP is party-visible (anyone with data for it in `characterHp`, players
      // included); monster HP stays DM-only intel — see hpFor.
      const hp = this.hpFor(token);

      // One Konva.Shape drawing the token's circle, label, and HP badge itself, instead of a
      // Group with up to 4 child shapes (Circle/Text/Rect/Text) — same rationale as drawGrid:
      // every extra Konva Shape is another hit-color assignment at construction time, and that
      // gets expensive on canvas-farbling browsers (Firefox/Safari private-browsing windows in
      // particular default to it even when the regular window doesn't).
      const shape = new Konva.Shape({
        x: cx,
        y: cy,
        draggable: this.auth.isAdmin() && !this.activeMeasureTool(),
        // Never actually rendered (sceneFunc paints the real look manually) — just needs to be
        // truthy so Konva's hasFill() considers this shape fillable, which fillStrokeShape() in
        // hitFunc below requires before it will paint anything to the hit canvas at all.
        fill: '#000',
        // Konva can only reuse sceneFunc for hit-testing automatically when it draws via its own
        // fillStrokeShape()/context helpers — ours paints with raw context.fillStyle/fill() calls
        // (needed for the label/HP badge), which Konva has no way to intercept, so the hit canvas
        // ends up with the shape's real visual colors instead of its assigned lookup color and
        // hit-testing never resolves to it: clicks and drags silently fall through to the map
        // image underneath. This explicit hitFunc — using fillStrokeShape(), which Konva *does*
        // swap the color on — gives it a real (if simplified, circle-only) clickable region.
        hitFunc: (context, hitShape) => {
          context.beginPath();
          context.arc(0, 0, r - 3, 0, Math.PI * 2);
          context.closePath();
          context.fillStrokeShape(hitShape);
        },
        sceneFunc: context => {
          context.beginPath();
          context.arc(0, 0, r - 3, 0, Math.PI * 2);
          context.closePath();
          context.fillStyle = token.color;
          context.fill();
          context.lineWidth = 2;
          context.strokeStyle = '#fff';
          context.stroke();

          if (token.id === this.currentTurnTokenId()) {
            context.beginPath();
            context.arc(0, 0, r + 2, 0, Math.PI * 2);
            context.lineWidth = 3;
            context.strokeStyle = '#f5d67a';
            context.stroke();
          }

          context.font = `${labelFontSize}px Arial`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillStyle = '#fff';
          context.fillText(label, 0, 0);

          if (hp) {
            const text = `${hp.hp}/${hp.max_hp}`;
            const fontSize = Math.max(10, Math.min(13, r * 0.4));
            context.font = `bold ${fontSize}px Arial`;
            const padX = 4, padY = 2;
            const labelW = context.measureText(text).width;
            const labelH = fontSize;
            const bgY = -(r + labelH + padY * 2 + 4);
            const rectX = -labelW / 2 - padX;
            const rectW = labelW + padX * 2;
            const rectH = labelH + padY * 2;
            const radius = 3;

            context.beginPath();
            context.moveTo(rectX + radius, bgY);
            context.arcTo(rectX + rectW, bgY, rectX + rectW, bgY + rectH, radius);
            context.arcTo(rectX + rectW, bgY + rectH, rectX, bgY + rectH, radius);
            context.arcTo(rectX, bgY + rectH, rectX, bgY, radius);
            context.arcTo(rectX, bgY, rectX + rectW, bgY, radius);
            context.closePath();
            context.fillStyle = 'rgba(20, 18, 14, 0.75)';
            context.fill();

            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillStyle = this.hpLabelColor(hp.hp, hp.max_hp);
            context.fillText(text, 0, bgY + rectH / 2);
          }
        },
      });
      // Konva can't infer a bounding box from an arbitrary sceneFunc, so a plain custom Shape
      // reports a zero-size getSelfRect() by default. Left unset, that zero-size box can make
      // hit-testing skip the shape entirely (falling through to the map image beneath it) —
      // clicks silently fail to select the token, and drags never start. This just tells Konva
      // where the shape actually is; it doesn't touch how sceneFunc draws it.
      shape.getSelfRect = () => ({ x: -r, y: -r, width: r * 2, height: r * 2 });

      shape.on('click tap', () => this.tokenClicked.emit(token));
      if (this.auth.isAdmin()) {
        shape.on('dragend', async () => {
          const pos = shape.position();
          await this.mapService.upsertToken({ ...token, x: Math.floor(pos.x / cellSize), y: Math.floor(pos.y / cellSize) });
        });
        shape.on('contextmenu', (e) => { e.evt.preventDefault(); this.removeToken(token); });
      }
      layer.add(shape);
    }
    layer.draw();
  }

  // Distance is snapped to grid intersections (rounded, not floored like token placement, so a
  // drag that ends mid-square still reads as a clean whole-square distance) and assumes the 5e
  // default of 1 square = 5 ft — this map has no per-map scale to read instead.
  private static readonly FEET_PER_SQUARE = 5;

  private snapToGrid(): { col: number; row: number } {
    const pos = this.stage!.getPointerPosition()!;
    return {
      col: Math.round(pos.x / this.cellSize),
      row: Math.round(pos.y / this.cellSize),
    };
  }

  private renderMeasurements() {
    const layer = this.measureLayer;
    if (!layer) return;
    layer.destroyChildren();

    const all = [...this.remoteMeasurements.values()];
    if (this.localMeasurement) all.push(this.localMeasurement);

    for (const m of all) {
      if (m.originCol === m.pointCol && m.originRow === m.pointRow) continue;
      this.drawMeasurement(layer, m);
    }
    layer.draw();
  }

  private drawMeasurement(layer: Konva.Layer, m: Measurement) {
    const cs = this.cellSize;
    const ox = m.originCol * cs, oy = m.originRow * cs;
    const px = m.pointCol * cs, py = m.pointRow * cs;
    const dx = px - ox, dy = py - oy;
    const distancePx = Math.hypot(dx, dy);
    const squares = distancePx / cs;
    const feet = Math.round(squares * BattleMapComponent.FEET_PER_SQUARE);
    const color = '#f5d67a';

    if (m.shape === 'line') {
      layer.add(new Konva.Line({ points: [ox, oy, px, py], stroke: color, strokeWidth: 3, lineCap: 'round' }));
      layer.add(new Konva.Circle({ x: ox, y: oy, radius: 4, fill: color }));
      layer.add(new Konva.Circle({ x: px, y: py, radius: 4, fill: color }));
      this.addMeasureLabel(layer, `${feet} ft`, (ox + px) / 2, (oy + py) / 2);
    } else if (m.shape === 'sphere') {
      layer.add(new Konva.Circle({
        x: ox, y: oy, radius: distancePx,
        stroke: color, strokeWidth: 2, fill: 'rgba(245, 214, 122, 0.15)',
      }));
      this.addMeasureLabel(layer, `${feet} ft`, ox, oy);
    } else {
      // Cone: apex at the origin, width at the far end equals the cone's length (the 5e
      // convention) — an isoceles triangle from the origin out to two points straddling the
      // drag point, offset perpendicular to the drag direction by half the length.
      const nx = -dy / distancePx, ny = dx / distancePx;
      const half = distancePx / 2;
      const leftX = px + nx * half, leftY = py + ny * half;
      const rightX = px - nx * half, rightY = py - ny * half;
      layer.add(new Konva.Line({
        points: [ox, oy, leftX, leftY, rightX, rightY],
        closed: true, stroke: color, strokeWidth: 2, fill: 'rgba(245, 214, 122, 0.15)',
      }));
      this.addMeasureLabel(layer, `${feet} ft`, px, py);
    }
  }

  private addMeasureLabel(layer: Konva.Layer, text: string, x: number, y: number) {
    layer.add(new Konva.Text({
      x, y, text, fontSize: 14, fontStyle: 'bold',
      fill: '#fff', offsetX: text.length * 3.5, offsetY: 20,
      shadowColor: '#000', shadowBlur: 4, shadowOpacity: 0.8,
    }));
  }

  private hpFor(token: MapToken): { hp: number; max_hp: number } | null {
    if (token.character_id) return this.characterHp()[token.character_id] ?? null;
    // Monster hp/max_hp lives directly on the token, but stays hidden from players — standard
    // hide-the-enemy's-exact-HP table convention, unlike character HP which is party-visible.
    if (this.auth.isAdmin() && token.hp != null && token.max_hp != null) return { hp: token.hp, max_hp: token.max_hp };
    return null;
  }

  private hpLabelColor(hp: number, maxHp: number): string {
    if (!maxHp) return '#ede9df';
    const pct = (hp / maxHp) * 100;
    if (pct <= 25) return '#e05252';
    if (pct <= 50) return '#eab308';
    return '#4caf82';
  }

  async removeToken(token: MapToken) {
    if (!await this.confirm.confirm(`Remove "${token.label ?? 'this token'}" from the map?`, 'Remove Token', 'Remove')) return;
    await this.mapService.deleteToken(token.id!, this.mapId);
  }

  // Manual entry — used for a player token's DM-supplied roll, or to hand-correct any token.
  // Relies on the same socket echo every other token edit does, so no local state patch here.
  async setInitiative(token: MapToken, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Math.floor(Number(trimmed));
    if (trimmed !== '' && Number.isNaN(value)) return;
    if (value === (token.initiative ?? null)) return;
    await this.mapService.upsertToken({ ...token, initiative: value });
  }

  async rerollInitiative(token: MapToken) {
    await this.mapService.rerollInitiative(this.mapId, token.id!);
  }

  private async addTokenAt(col: number, row: number, _cellSize: number) {
    const entity = this.placingEntity();
    if (entity) {
      await this.mapService.upsertToken({
        map_id: this.mapId,
        label: entity.label,
        color: entity.color,
        x: col, y: row,
        size: entity.size,
        hp: entity.hp,
        max_hp: entity.max_hp,
        is_player: entity.kind === 'character',
        character_id: entity.characterId,
        monster_index: entity.monsterIndex,
      });
      return;
    }
    await this.mapService.upsertToken({
      map_id: this.mapId,
      label: this.newToken.label,
      color: this.newToken.color,
      x: col, y: row,
      size: this.newToken.size,
      is_player: this.newToken.is_player,
    });
  }
}
