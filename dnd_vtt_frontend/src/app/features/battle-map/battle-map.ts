import {
  Component, ElementRef, inject, input, output, signal, computed, effect, OnInit, AfterViewInit, OnDestroy, ViewChild
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BattleMapService } from '../../core/services/battle-map.service';
import { AuthService } from '../../core/services/auth.service';
import { MapToken, BattleMap, MapFog, PlacingEntity, MeasureShape, FogToolName } from '../../core/models/campaign.model';
import { ConfirmService } from '../../shared/confirm.service';
import { ResizeHandleDirective } from '../../shared/directives/resize-handle.directive';
import { drawGrid } from './canvas/grid-renderer';
import { renderMoveRange } from './canvas/move-range-renderer';
import { renderTokens } from './canvas/token-renderer';
import { portraitDataUri } from '../../core/utils/avatar';
import { getErrorMessage } from '../../core/utils/error-message';
import { MeasurementTool, pointerToGridPos, FEET_PER_SQUARE } from './canvas/measurement-tool';
import { FogTool, cellUnderPointer } from './canvas/fog-tool';
import { MapToolbarComponent } from './components/map-toolbar/map-toolbar';
import { TurnOrderPanelComponent } from './components/turn-order-panel/turn-order-panel';

@Component({
  selector: 'app-battle-map',
  imports: [
    RouterLink, MatIconModule, MatTooltipModule, ResizeHandleDirective,
    MapToolbarComponent, TurnOrderPanelComponent,
  ],
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
  // Portrait seed for character tokens, keyed by character_id — same sourcing story as
  // characterHp above (DM roster vs. player presence). Resolved to loaded <img>s in
  // resolvePortraitImages() below before being handed to renderTokens().
  readonly characterPortraits = input<Record<string, string>>({});
  // Id of the token whose turn it currently is (from the embedding parent's Encounter record) —
  // drives the highlight ring drawn in renderTokens() and the turn-order row highlight below.
  readonly currentTurnTokenId = input<string | null>(null);
  // The viewing player's own character — set only by the player-facing embedding (the DM has no
  // "own character"), used to find their token and offer a "show my movement range" toggle. Speed
  // is passed in feet rather than the Character record itself, so this component doesn't need to
  // know the Character model at all.
  readonly myCharacterId = input<string | null>(null);
  readonly myMoveSpeedFt = input<number | null>(null);
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
  // Last token this viewer clicked — kept purely so it renders above any tokens it overlaps
  // (see token-renderer.ts's ordering). Local to this viewer only; never broadcast.
  selectedTokenId = signal<string | null>(null);

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
    if (this.activeMeasureTool()) this.activeFogTool.set(null);
  }

  // DM-only fog-of-war tools — mutually exclusive with the measure tool above, same reasoning:
  // both repurpose the stage's mousedown/mousemove/mouseup handlers, so only one can drive them
  // at a time. A map starts fully visible (`hidden_cells` empty); the DM hides areas rather than
  // revealing them.
  fog = signal<MapFog>({ enabled: false, hidden_cells: [] });
  activeFogTool = signal<FogToolName | null>(null);

  toggleFogTool(tool: FogToolName) {
    this.activeFogTool.update(current => current === tool ? null : tool);
    if (this.activeFogTool()) this.activeMeasureTool.set(null);
  }

  selectPointerTool() {
    this.activeMeasureTool.set(null);
    this.activeFogTool.set(null);
  }

  async toggleFogEnabled() {
    await this.mapService.setFogEnabled(this.mapId, !this.fog().enabled);
  }

  async revealAllFog() {
    if (!await this.confirm.confirm(
      'Reveal the entire map? Any areas you\'ve hidden will become visible again.', 'Reveal All', 'Reveal'
    )) return;
    await this.mapService.resetFog(this.mapId);
  }

  // Personal reference only — not broadcast (unlike the measure tools above), since this is "let
  // me see my own reach," not something that needs to appear on anyone else's screen.
  showMoveRange = signal(false);

  myToken = computed(() => this.tokens().find(t => t.character_id === this.myCharacterId()) ?? null);
  private moveRangeSquares = computed(() => {
    const ft = this.myMoveSpeedFt();
    return ft ? Math.floor(ft / FEET_PER_SQUARE) : 0;
  });

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
  private fogLayer?: Konva.Layer;
  private measureLayer?: Konva.Layer;
  private moveRangeLayer?: Konva.Layer;
  private konvaImg?: Konva.Image;
  private img?: HTMLImageElement;
  private gridSize = 50;
  // Watches the canvas's own container rather than the window, since dragging either flanking
  // sidebar's resize handle (see ResizeHandleDirective) resizes this container without ever
  // firing a window resize event.
  private resizeObserver?: ResizeObserver;
  private tokenSub?: Subscription;
  private measureSub?: Subscription;
  private fogSub?: Subscription;
  private measurementTool = new MeasurementTool();
  private fogTool = new FogTool((cells, revealed) => this.mapService.paintFog(this.mapId, cells, revealed));
  private lastMeasureBroadcast = 0;
  private mapId!: string;
  private routeMapId: string | null = null;
  private viewReady = signal(false);
  private loadedMapId: string | null = null;
  private cellSize = 0;
  // Mirrors the `tokens` signal as a plain field so the characterHp redraw effect below can read
  // it without also re-triggering on every token change (the socket subscription already redraws directly).
  private lastTokens: MapToken[] = [];
  // Loaded portrait <img>s, keyed by `${characterId}:${seed}` so a changed seed (re-picked
  // portrait) naturally gets its own entry instead of showing a stale cached image. Populated
  // lazily by resolvePortraitImages() — decoding a data URI into an Image is still async even
  // though portraitDataUri() itself returns synchronously.
  private portraitImageCache: Record<string, HTMLImageElement> = {};

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
      this.characterPortraits();
      this.currentTurnTokenId();
      this.activeMeasureTool();
      this.fog();
      this.selectedTokenId();
      if (this.tokenLayer && this.cellSize) {
        this.renderTokens(this.lastTokens);
      }
    });

    // The movement-range highlight depends on where `myToken` currently is (which moves whenever
    // the token list updates) as well as the toggle and the character's speed.
    effect(() => {
      this.showMoveRange();
      this.myToken();
      if (this.moveRangeLayer && this.cellSize && this.stage) {
        renderMoveRange(this.moveRangeLayer, this.stage, this.cellSize, this.showMoveRange(), this.myToken(), this.moveRangeSquares());
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
    this.fogSub?.unsubscribe();
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
    this.fogSub?.unsubscribe();
    this.fogSub = undefined;
    this.measurementTool.reset();
    this.fogTool.reset();
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
    } catch (e) {
      this.error.set(getErrorMessage(e));
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
    this.fogLayer = new Konva.Layer();
    this.moveRangeLayer = new Konva.Layer();
    this.tokenLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer();
    this.stage.add(this.mapLayer, this.gridLayer, this.fogLayer, this.moveRangeLayer, this.tokenLayer, this.measureLayer);
    // Purely visual, drawn beneath the tokens — token *filtering* in renderTokens() is what
    // actually hides monsters from players; this layer just tints/blacks-out fogged terrain.
    this.fogLayer.listening(false);
    // Purely visual, drawn beneath the tokens — never clicked or dragged.
    this.moveRangeLayer.listening(false);
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
      if (e.target === this.konvaImg && this.auth.isAdmin() && !this.activeMeasureTool() && !this.activeFogTool()) {
        const pos = this.stage!.getPointerPosition()!;
        const col = Math.floor(pos.x / this.cellSize);
        const row = Math.floor(pos.y / this.cellSize);
        this.addTokenAt(col, row);
      }
    });

    this.stage.on('mousedown touchstart', () => {
      const fogTool = this.activeFogTool();
      if (fogTool === 'reveal-brush' || fogTool === 'hide-brush') {
        this.fogTool.beginBrush(fogTool === 'reveal-brush', cellUnderPointer(this.stage!, this.cellSize));
        this.renderFog();
        return;
      }
      if (fogTool === 'reveal-rect' || fogTool === 'hide-rect') {
        this.fogTool.beginRect(cellUnderPointer(this.stage!, this.cellSize));
        this.renderFog();
        return;
      }
      const shape = this.activeMeasureTool();
      if (!shape) return;
      const { col, row } = pointerToGridPos(this.stage!, this.cellSize);
      this.measurementTool.begin(shape, col, row);
    });

    this.stage.on('mousemove touchmove', () => {
      if (this.fogTool.isPaintingBrush) {
        this.fogTool.continueBrush(cellUnderPointer(this.stage!, this.cellSize));
        this.renderFog();
        return;
      }
      if (this.fogTool.isDraggingRect) {
        this.fogTool.updateRect(cellUnderPointer(this.stage!, this.cellSize));
        this.renderFog();
        return;
      }
      if (!this.measurementTool.current) return;
      const { col, row } = pointerToGridPos(this.stage!, this.cellSize);
      this.measurementTool.update(col, row);
      this.renderMeasurements();

      // Throttled so a raw mousemove stream doesn't flood the socket.
      // Only the DM's measurements go out over the wire — everyone should see those.
      // A player's own measurement stays local-only (drawn above via renderMeasurements()),
      // so nobody else, including the DM, sees another player's ruler.
      if (this.auth.isAdmin()) {
        const now = Date.now();
        if (now - this.lastMeasureBroadcast > 50) {
          this.lastMeasureBroadcast = now;
          this.mapService.sendMeasure(this.mapId, this.measurementTool.current);
        }
      }
    });

    this.stage.on('mouseup touchend', () => {
      if (this.fogTool.isPaintingBrush) {
        this.fogTool.endBrush();
        this.renderFog();
        return;
      }
      if (this.fogTool.isDraggingRect) {
        this.fogTool.endRect(this.activeFogTool() === 'reveal-rect');
        this.renderFog();
        return;
      }
      if (!this.measurementTool.current) return;
      this.measurementTool.end();
      this.renderMeasurements();
      if (this.auth.isAdmin()) {
        this.mapService.sendMeasure(this.mapId, null);
      }
    });

    this.tokenSub = this.mapService.watchTokens(this.mapId).subscribe(tokens => {
      this.tokens.set(tokens);
      this.lastTokens = tokens;
      this.renderTokens(tokens);
    });

    this.measureSub = this.mapService.watchMeasurements().subscribe(({ senderId, measurement }) => {
      this.measurementTool.setRemote(senderId, measurement);
      this.renderMeasurements();
    });

    this.fogSub = this.mapService.watchFog(this.mapId).subscribe(fog => {
      this.fog.set(fog);
      this.renderFog();
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

    drawGrid(this.gridLayer!, w, h, this.cellSize);
    this.renderFog();
    this.renderTokens(this.lastTokens);
    renderMoveRange(this.moveRangeLayer!, this.stage, this.cellSize, this.showMoveRange(), this.myToken(), this.moveRangeSquares());
  }

  private renderFog() {
    const layer = this.fogLayer;
    if (!layer) return;
    this.fogTool.render(
      layer, this.fog(), this.auth.isAdmin(), this.img, this.gridSize, this.cellSize,
      this.activeFogTool() === 'reveal-rect',
    );
  }

  private renderTokens(tokens: MapToken[]) {
    const layer = this.tokenLayer;
    if (!layer) return;
    renderTokens(layer, tokens, {
      cellSize: this.cellSize,
      fog: this.fog(),
      isAdmin: this.auth.isAdmin(),
      activeMeasureTool: this.activeMeasureTool(),
      currentTurnTokenId: this.currentTurnTokenId(),
      selectedTokenId: this.selectedTokenId(),
      characterHp: this.characterHp(),
      characterPortraits: this.resolvePortraitImages(this.characterPortraits()),
      onTokenClick: token => {
        this.selectedTokenId.set(token.id ?? null);
        this.tokenClicked.emit(token);
      },
      // The drag itself is kept on top via token-renderer's moveToTop() (safe mid-drag, since it
      // doesn't touch this component's state). Persisting the selection here, once the drag has
      // actually ended, makes it stick across future full redraws too (HP changes, fog, other
      // players' token updates) without risking a rebuild while Konva still owns the drag.
      onTokenMoved: (token, col, row) => {
        this.selectedTokenId.set(token.id ?? null);
        return this.mapService.upsertToken({ ...token, x: col, y: row });
      },
      onTokenContextMenu: token => this.removeToken(token),
    });
  }

  // Resolves seeds to loaded <img>s for token-renderer to draw, decoding lazily and caching by
  // `${characterId}:${seed}`. A seed not yet decoded is simply omitted this pass (the token falls
  // back to its plain color fill) — the onload handler triggers a redraw once it's ready.
  private resolvePortraitImages(seeds: Record<string, string>): Record<string, HTMLImageElement> {
    const resolved: Record<string, HTMLImageElement> = {};
    for (const [characterId, seed] of Object.entries(seeds)) {
      const cacheKey = `${characterId}:${seed}`;
      let img = this.portraitImageCache[cacheKey];
      if (!img) {
        img = new Image();
        img.onload = () => this.renderTokens(this.lastTokens);
        img.src = portraitDataUri(seed);
        this.portraitImageCache[cacheKey] = img;
      }
      if (img.complete && img.naturalWidth) resolved[characterId] = img;
    }
    return resolved;
  }

  private renderMeasurements() {
    const layer = this.measureLayer;
    if (!layer) return;
    this.measurementTool.render(layer, this.cellSize);
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

  private async addTokenAt(col: number, row: number) {
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
    // Embedded views (encounter play, player session) have no `newToken` form on screen — an
    // encounter's roster sidebar arms a PlacingEntity (including the "Add Empty Token" tool)
    // instead, so an unarmed click there should be a no-op rather than silently dropping a
    // default red "Token". Only the standalone map editor, where the Add Token sidebar form is
    // visible and pre-fillable, should place from `newToken` on a bare click.
    if (this.embedded()) return;
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
