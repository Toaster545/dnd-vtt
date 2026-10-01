import {
  Component, ElementRef, inject, input, output, signal, computed, effect, OnInit, AfterViewInit, OnDestroy, ViewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BattleMapService } from '../../core/services/battle-map.service';
import { AuthService } from '../../core/services/auth.service';
import {
  MapToken, BattleMap, MapFog, MapLight, MapLighting, MapWall, PlacingEntity, MeasureShape, FogToolName,
  LightToolName,
} from '../../core/models/campaign.model';
import { Character } from '../../core/models/character.model';
import { ConfirmService } from '../../shared/confirm.service';
import { ResizeHandleDirective } from '../../shared/directives/resize-handle.directive';
import { drawGrid } from './canvas/grid-renderer';
import { renderMoveRange } from './canvas/move-range-renderer';
import { Trail, TrailDrag, renderTurnTrails } from './canvas/turn-trail-renderer';
import { PlanMarker, renderPlanMarker } from './canvas/plan-marker-renderer';
import { renderTokens, snapToCell } from './canvas/token-renderer';
import { isTokenLit, litAreas, renderDarkness, renderLightMarkers } from './canvas/lighting-renderer';
import { getErrorMessage } from '../../core/utils/error-message';
import { MeasurementTool } from './canvas/measurement-tool';
import { FogTool } from './canvas/fog-tool';
import { WallTool, wallIndexNear, wallPointUnderPointer } from './canvas/wall-tool';
import { PortraitCache } from './canvas/portrait-cache';
import { TokenImageCache } from './canvas/token-image-cache';
import { PortraitSource } from '../../core/models/avatar.model';
import { StagePointerTools } from './canvas/stage-pointer-tools';
import { StageView } from './canvas/stage-view';
import { MapToolbarComponent } from './components/map-toolbar/map-toolbar';
import { TurnOrderPanelComponent } from './components/turn-order-panel/turn-order-panel';
import { LightEditorPanelComponent } from './components/light-editor-panel/light-editor-panel';
import { CharacterPlaySheetComponent } from '../characters/character-play-sheet/character-play-sheet';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { PageHeaderComponent } from '../../shared/layout/page-header/page-header';

@Component({
  selector: 'app-battle-map',
  imports: [
    ResizeHandleDirective, MapToolbarComponent, TurnOrderPanelComponent, LightEditorPanelComponent,
    CharacterPlaySheetComponent, MainLayoutComponent, PageHeaderComponent, MatIconModule, MatTooltipModule,
  ],
  templateUrl: './battle-map.html',
  styleUrl: './battle-map.scss',
})
export class BattleMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stageContainer') stageContainer!: ElementRef<HTMLDivElement>;

  readonly mapIdInput = input<string | undefined>(undefined);
  readonly embedded   = input(false);
  readonly placingEntity = input<PlacingEntity | null>(null);
  readonly characterHp = input<Record<string, { hp: number; max_hp: number }>>({});
  readonly characterPortraits = input<Record<string, PortraitSource>>({});
  readonly currentTurnTokenId = input<string | null>(null);
  // An encounter's tokens across all of its levels (see EncounterService.watchTurnOrder). When
  // set, the turn order panel lists these instead of just this map's own tokens.
  readonly turnOrderTokens = input<MapToken[] | null>(null);
  // Player screens hold the turn order back until round 2 — see PlayerCampaignSessionComponent.
  readonly showTurnOrder = input(true);
  readonly myCharacterId = input<string | null>(null);
  readonly myMoveSpeedFt = input<number | null>(null);
  // Personal, not shared — only ever set on the viewing player's own component instance (see
  // player-campaign-session.ts), never broadcast. Punches a viewer-only hole in *this browser's*
  // darkness render around the player's own token; nobody else's screen is affected by it.
  readonly myDarkvisionFt = input<number | null>(null);
  readonly canControl = input<boolean | null>(null);
  // The viewing player's live character — when set, the player-facing side panel gains a
  // collapsible "Character Sheet" section alongside Turn Order so the sheet can be referenced
  // without leaving the map (see player-campaign-session.html). Never set for the DM.
  readonly myCharacter = input<Character | null>(null);
  readonly tokenClicked = output<MapToken>();
  readonly currentTurnTokenChanged = output<MapToken | null>();
  readonly characterSaved = output<Character>();

  mapService = inject(BattleMapService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  private mapImageObjectUrl?: string;

  map = signal<BattleMap | null>(null);
  tokens = signal<MapToken[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedTokenId = signal<string | null>(null);

  // Whole-page fullscreen (not just the map canvas) so the DM's roster/turn-order panels and the
  // player's own session chrome stay visible — this only hides the browser's own tab/address bar.
  // Shared across every screen that embeds this component (DM encounter play, player session
  // view, the standalone player-view screen) since it's implemented once, here. Escape always
  // exits it — that's native Fullscreen API behavior, the same for every user, no code needed.
  isFullscreen = signal(!!document.fullscreenElement);
  private readonly onFullscreenChange = () => this.isFullscreen.set(!!document.fullscreenElement);

  async toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }

  newToken = { label: 'Token', color: '#e74c3c', size: 1, is_player: false };

  controlsMap = computed(() => this.canControl() ?? (!this.embedded() && this.auth.isAdmin()));

  // DM roster / turn-order aside — unchanged, simple single width.
  rightAsideWidth = signal(256);

  onRightAsideResize(dx: number) {
    this.rightAsideWidth.update(w => Math.min(420, Math.max(220, w - dx)));
  }

  // Player in-encounter panel: turn order and character sheet sit side by side, each with its
  // own resize handle and its own persisted width, and each independently collapsible to a
  // small top-left button.
  private static readonly TURN_W_KEY = 'dnd-battlemap-turn-w';
  private static readonly SHEET_W_KEY = 'dnd-battlemap-sheet-w';
  private static readonly PANEL_TURNCOL_KEY = 'dnd-battlemap-turn-col';
  private static readonly PANEL_SHEETCOL_KEY = 'dnd-battlemap-sheet-col';

  turnColWidth = signal(BattleMapComponent.readStoredNumber(BattleMapComponent.TURN_W_KEY, 208));
  sheetWidth = signal(BattleMapComponent.readStoredNumber(BattleMapComponent.SHEET_W_KEY, 460));
  showTurnColumn = signal(BattleMapComponent.readStoredBool(BattleMapComponent.PANEL_TURNCOL_KEY, true));
  showSheetColumn = signal(BattleMapComponent.readStoredBool(BattleMapComponent.PANEL_SHEETCOL_KEY, true));

  onTurnColResize(dx: number) {
    this.turnColWidth.update(w => Math.min(380, Math.max(160, w - dx)));
    BattleMapComponent.writeStored(BattleMapComponent.TURN_W_KEY, String(this.turnColWidth()));
  }

  onSheetResize(dx: number) {
    const max = Math.max(360, Math.min(window.innerWidth - 320, 1100));
    this.sheetWidth.update(w => Math.min(max, Math.max(300, w - dx)));
    BattleMapComponent.writeStored(BattleMapComponent.SHEET_W_KEY, String(this.sheetWidth()));
  }

  toggleTurnColumn() {
    this.showTurnColumn.update(v => !v);
    BattleMapComponent.writeStored(BattleMapComponent.PANEL_TURNCOL_KEY, String(this.showTurnColumn()));
  }

  toggleSheetColumn() {
    this.showSheetColumn.update(v => !v);
    BattleMapComponent.writeStored(BattleMapComponent.PANEL_SHEETCOL_KEY, String(this.showSheetColumn()));
  }

  private static readStoredNumber(key: string, fallback: number): number {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private static readStoredBool(key: string, fallback: boolean): boolean {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  }

  private static writeStored(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode) — non-critical */
    }
  }

  activeMeasureTool = signal<MeasureShape | null>(null);

  toggleMeasureTool(shape: MeasureShape) {
    this.activeMeasureTool.update(current => current === shape ? null : shape);
    this.pickingDestination.set(false);
    if (this.activeMeasureTool()) { this.activeFogTool.set(null); this.activeLightTool.set(null); }
  }

  fog = signal<MapFog>({ enabled: false, hidden_cells: [] });
  activeFogTool = signal<FogToolName | null>(null);

  toggleFogTool(tool: FogToolName) {
    this.activeFogTool.update(current => current === tool ? null : tool);
    if (this.activeFogTool()) { this.activeMeasureTool.set(null); this.activeLightTool.set(null); }
  }

  lighting = signal<MapLighting>({ enabled: false, lights: [], walls: [] });
  activeLightTool = signal<LightToolName | null>(null);
  selectedLightId = signal<string | null>(null);
  selectedLight = computed(() => this.lighting().lights.find(l => l.id === this.selectedLightId()) ?? null);
  // Radii the next placed torch gets — set in the aside while the place tool is active, and
  // still editable per torch afterwards via the light editor. Defaults match a 5e torch.
  newLightBrightFt = signal(20);
  newLightDimFt = signal(20);

  setNewLightRadius(which: 'bright' | 'dim', value: string) {
    const ft = Math.max(0, Number(value) || 0);
    (which === 'bright' ? this.newLightBrightFt : this.newLightDimFt).set(ft);
  }

  toggleLightTool(tool: LightToolName) {
    this.activeLightTool.update(current => current === tool ? null : tool);
    if (this.activeLightTool()) { this.activeMeasureTool.set(null); this.activeFogTool.set(null); }
  }

  // Walls are edited optimistically: the local `lighting` signal updates on every click so the
  // overlay and the light clipping react instantly, and the full list is saved after a short
  // debounce so a quick run of clicks around a room becomes one request instead of one per
  // segment. While a save is pending, incoming lighting broadcasts keep the local walls (see
  // lightingSub) so an unrelated update — a torch moved — can't briefly wipe unsaved walls.
  private pendingWalls: MapWall[] | null = null;
  private wallSaveTimer?: ReturnType<typeof setTimeout>;

  private commitWalls(walls: MapWall[]) {
    this.pendingWalls = walls;
    this.lighting.update(l => ({ ...l, walls }));
    clearTimeout(this.wallSaveTimer);
    this.wallSaveTimer = setTimeout(() => this.flushWalls(), 300);
  }

  private flushWalls() {
    clearTimeout(this.wallSaveTimer);
    this.wallSaveTimer = undefined;
    const walls = this.pendingWalls;
    if (!walls) return;
    const mapId = this.mapId;
    this.mapService.setWalls(mapId, walls).then(() => {
      if (this.pendingWalls === walls) this.pendingWalls = null;
    }).catch(async e => {
      // Drop the unsaved local walls and resync with what the server actually has.
      this.pendingWalls = null;
      // Shown over the (still usable) map briefly — there's no app-wide toast to route it to.
      const message = `Couldn't save walls: ${getErrorMessage(e)}`;
      this.error.set(message);
      setTimeout(() => { if (this.error() === message) this.error.set(null); }, 5000);
      if (mapId === this.mapId) this.lighting.set(await this.mapService.getLighting(mapId));
    });
  }

  async clearWalls() {
    if (!this.lighting().walls.length) return;
    if (!await this.confirm.confirm(
      'Remove every wall from this map? Light will spread freely again.', 'Clear Walls', 'Clear'
    )) return;
    this.wallTool.reset();
    this.commitWalls([]);
    this.flushWalls();
  }

  // Player side: picking the square they'd like the DM to move their token to. Their own pick is
  // fetched separately (the shared player token broadcast never carries it — see
  // MapsService.getTokenPlan) and refetched on every turn change, which is when the server clears it.
  pickingDestination = signal(false);
  myPlan = signal<{ x: number; y: number } | null>(null);

  togglePickDestination() {
    const picking = !this.pickingDestination();
    this.selectPointerTool();
    this.pickingDestination.set(picking);
  }

  async clearMyPlan() {
    const token = this.myToken();
    if (!token?.id) return;
    this.myPlan.set(null);
    await this.mapService.setTokenPlan(this.mapId, token.id, null);
  }

  private async setMyPlan(x: number, y: number) {
    const token = this.myToken();
    if (!token?.id) return;
    this.myPlan.set({ x, y });
    try {
      await this.mapService.setTokenPlan(this.mapId, token.id, { x, y });
    } catch (e) {
      this.myPlan.set(null);
      // Same brief over-the-map notice as a failed wall save (see flushWalls).
      const message = `Couldn't save your destination: ${getErrorMessage(e)}`;
      this.error.set(message);
      setTimeout(() => { if (this.error() === message) this.error.set(null); }, 5000);
    }
  }

  // What the plan layer shows: a player always sees their own pick; the DM only sees the pick of
  // the token whose turn it is.
  private planMarker = computed<PlanMarker | null>(() => {
    if (!this.controlsMap()) {
      const token = this.myToken();
      const plan = this.myPlan();
      return token && plan ? { token, ...plan } : null;
    }
    const token = this.tokens().find(t => t.id === this.currentTurnTokenId());
    if (!token || token.planned_x == null || token.planned_y == null) return null;
    return { token, x: token.planned_x, y: token.planned_y };
  });

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.pickingDestination.set(false);
    if (e.key === 'Escape' && this.wallTool.isChaining) {
      this.wallTool.endChain();
      this.renderWalls();
    }
  };

  selectPointerTool() {
    this.pickingDestination.set(false);
    this.activeMeasureTool.set(null);
    this.activeFogTool.set(null);
    this.activeLightTool.set(null);
  }

  get isEditingWalls(): boolean {
    const tool = this.activeLightTool();
    return tool === 'wall' || tool === 'erase-wall';
  }

  zoomIn() {
    this.stageView?.zoomIn();
  }

  zoomOut() {
    this.stageView?.zoomOut();
  }

  rotateView(deg: number) {
    this.stageView?.rotateBy(deg);
  }

  resetView() {
    this.stageView?.resetView();
  }

  fitMap() {
    this.stageView?.resetView();
  }

  centerOnPlayerToken() {
    const token = this.myToken();
    if (!token || !this.cellSize) return;
    this.stageView?.centerOn({
      x: (token.x + token.size / 2) * this.cellSize,
      y: (token.y + token.size / 2) * this.cellSize,
    });
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

  async toggleLightingEnabled() {
    await this.mapService.setLightingEnabled(this.mapId, !this.lighting().enabled);
  }

  selectLight(light: MapLight) {
    this.selectedLightId.set(light.id ?? null);
  }

  async updateSelectedLight(fields: Partial<MapLight>) {
    const light = this.selectedLight();
    if (!light) return;
    await this.mapService.upsertLight(this.mapId, { ...light, ...fields });
  }

  async moveLight(light: MapLight, x: number, y: number) {
    await this.mapService.upsertLight(this.mapId, { ...light, x, y });
  }

  async removeLight(light: MapLight) {
    if (!await this.confirm.confirm(`Remove "${light.label || 'this light'}" from the map?`, 'Remove Light', 'Remove')) return;
    if (!light.id) return;
    await this.mapService.deleteLight(this.mapId, light.id);
    if (this.selectedLightId() === light.id) this.selectedLightId.set(null);
  }

  private async placeLight(fields: Partial<Pick<MapLight, 'x' | 'y' | 'token_id'>>) {
    await this.mapService.upsertLight(this.mapId, {
      map_id: this.mapId,
      bright_radius_ft: this.newLightBrightFt(),
      dim_radius_ft: this.newLightDimFt(),
      color: '#ffa542',
      enabled: true,
      label: 'Torch',
      ...fields,
    });
  }

  showMoveRange = signal(false);

  myToken = computed(() => this.tokens().find(t => t.character_id === this.myCharacterId()) ?? null);
  // Just the id, so effects keyed on it don't rerun on every token broadcast.
  private myTokenId = computed(() => this.myToken()?.id ?? null);
  private moveRangeFt = computed(() => this.myMoveSpeedFt() ?? 0);
  // During the player's turn the range is drawn from where the turn began, not from wherever the
  // token has moved since — it shows the whole turn's reach, which doesn't shrink as they move.
  private moveRangeOrigin = computed(() => {
    const token = this.myToken();
    if (!token || token.turn_start_x == null || token.turn_start_y == null) return token;
    return { ...token, x: token.turn_start_x, y: token.turn_start_y };
  });

  turnOrder = computed(() => {
    return [...(this.turnOrderTokens() ?? this.tokens())].sort((a, b) => {
      if (a.initiative == null && b.initiative == null) return 0;
      if (a.initiative == null) return 1;
      if (b.initiative == null) return -1;
      return b.initiative - a.initiative;
    });
  });

  // The read-only (player-facing) turn order column: allowed by the host, and not collapsed by
  // the player — a sheet-less viewer has no collapse control, so it's always open for them.
  turnColumnVisible = computed(() =>
    this.showTurnOrder() && (this.showTurnColumn() || !this.myCharacter())
  );

  currentTurnToken = computed(() =>
    this.turnOrder().find(t => t.id === this.currentTurnTokenId()) ?? null
  );

  private stage?: Konva.Stage;
  private mapLayer?: Konva.Layer;
  private tokenLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;
  private fogLayer?: Konva.Layer;
  private darknessLayer?: Konva.Layer;
  private lightMarkerLayer?: Konva.Layer;
  private wallLayer?: Konva.Layer;
  private measureLayer?: Konva.Layer;
  private moveRangeLayer?: Konva.Layer;
  private trailLayer?: Konva.Layer;
  private planLayer?: Konva.Layer;
  private konvaImg?: Konva.Image;
  private img?: HTMLImageElement;
  private gridSize = 50;
  private resizeObserver?: ResizeObserver;
  // A genuine browser-window resize still refits the map to the container; a container-only
  // size change (side panel resized/collapsed) goes through the ResizeObserver and only
  // re-syncs the stage buffer, without rescaling the map. See fitToContainer/syncStageSize.
  private readonly onWindowResize = () => this.fitToContainer();
  private tokenSub?: Subscription;
  private measureSub?: Subscription;
  private fogSub?: Subscription;
  private lightingSub?: Subscription;
  private measurementTool = new MeasurementTool();
  private wallTool = new WallTool();
  private fogTool = new FogTool((cells, revealed) => this.mapService.paintFog(this.mapId, cells, revealed));
  private pointerTools?: StagePointerTools;
  private stageView?: StageView;
  private mapId!: string;
  private routeMapId: string | null = null;
  private viewReady = signal(false);
  private loadedMapId: string | null = null;
  private cellSize = 0;
  private lastTokens: MapToken[] = [];
  // Set from pressing a token until the button is released. Rebuilding the token layer then (a
  // socket broadcast, an image finishing loading, an HP change...) destroys the node Konva is
  // dragging and drops the token, so renders are held until release instead (see renderTokens).
  private tokenHeld = false;
  private tokenRenderPending = false;
  // Registered after Konva's own window mouseup listener, so it runs after the drop's dragend.
  private readonly onPointerRelease = () => {
    if (!this.tokenHeld) return;
    this.tokenHeld = false;
    if (this.tokenRenderPending) this.renderTokens(this.lastTokens);
  };
  private portraitCache = new PortraitCache();
  private tokenImageCache = new TokenImageCache();

  constructor() {
    effect(() => {
      const ready = this.viewReady();
      const id = this.mapIdInput() ?? this.routeMapId ?? '';
      if (!ready || !id || id === this.loadedMapId) return;
      this.loadedMapId = id;
      this.loadMap(id);
    });

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

    effect(() => {
      this.showMoveRange();
      this.moveRangeOrigin();
      if (this.moveRangeLayer && this.cellSize && this.stage) {
        renderMoveRange(this.moveRangeLayer, this.cellSize, this.showMoveRange(), this.moveRangeOrigin(), this.moveRangeFt());
      }
    });

    effect(() => {
      this.planMarker();
      this.renderPlan();
    });

    effect(() => {
      const picking = this.pickingDestination();
      if (this.stage) this.stage.container().style.cursor = picking ? 'crosshair' : '';
    });

    // Refetch the player's own destination whenever their token or the turn changes.
    effect(() => {
      const tokenId = this.myTokenId();
      this.currentTurnTokenId();
      if (this.controlsMap() || !tokenId) {
        this.myPlan.set(null);
        return;
      }
      const mapId = this.mapId;
      this.mapService.getTokenPlan(mapId, tokenId).then(
        plan => { if (this.myTokenId() === tokenId) this.myPlan.set(plan); },
        () => {},
      );
    });

    effect(() => {
      this.currentTurnTokenId();
      this.fog();
      this.myMoveSpeedFt();
      this.renderTrail();
    });

    effect(() => {
      this.currentTurnTokenChanged.emit(this.currentTurnToken());
    });

    // Re-renders on lighting state or selection changes; token-position-driven re-renders (an
    // attached light following its token) are handled directly in the tokenSub subscription
    // below instead, since `lastTokens` is a plain field, not a signal this effect can track.
    effect(() => {
      this.lighting();
      this.selectedLightId();
      this.controlsMap();
      this.myDarkvisionFt();
      this.myToken();
      if (this.darknessLayer && this.cellSize) {
        // Torches moving, walls changing, or darkness toggling change which enemies a player sees.
        this.renderTokens(this.lastTokens);
        this.renderTrail();
        this.renderDarkness();
        this.renderLightMarkers();
        this.renderWalls();
      }
    });

    // Leaving the wall tools drops any half-drawn chain / eraser highlight. While they're armed,
    // tokens and torch markers stop listening so clicks (and right-click to end a chain) land on
    // the wall tool instead of dragging a token or triggering its remove-on-right-click.
    effect(() => {
      const tool = this.activeLightTool();
      if (tool !== 'wall') this.wallTool.endChain();
      if (tool !== 'wall') this.wallTool.setHover(null);
      if (tool !== 'erase-wall') this.wallTool.setEraseHover(-1);
      const editing = tool === 'wall' || tool === 'erase-wall';
      this.tokenLayer?.listening(!editing);
      this.lightMarkerLayer?.listening(!editing);
      this.renderWalls();
    });

    effect(() => {
      const canPan = !this.activeFogTool() && !this.activeMeasureTool() && !this.activeLightTool();
      this.stageView?.setPannable(canPan);
    });
  }

  ngOnInit() {
    this.routeMapId = this.route.snapshot.paramMap.get('id');
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    window.addEventListener('keydown', this.onKeyDown);
    for (const type of ['mouseup', 'touchend', 'touchcancel', 'blur']) {
      window.addEventListener(type, this.onPointerRelease);
    }
  }

  ngAfterViewInit() {
    this.viewReady.set(true);
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    window.removeEventListener('keydown', this.onKeyDown);
    for (const type of ['mouseup', 'touchend', 'touchcancel', 'blur']) {
      window.removeEventListener(type, this.onPointerRelease);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.flushWalls();
    this.tokenSub?.unsubscribe();
    this.measureSub?.unsubscribe();
    this.fogSub?.unsubscribe();
    this.lightingSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.stageView?.destroy();
    this.stage?.destroy();
    if (this.mapImageObjectUrl) URL.revokeObjectURL(this.mapImageObjectUrl);
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
    this.lightingSub?.unsubscribe();
    this.lightingSub = undefined;
    // Save any walls still waiting on the debounce against the map they were drawn on, before
    // this.mapId moves to the new one.
    this.flushWalls();
    this.measurementTool.reset();
    this.fogTool.reset();
    this.wallTool.reset();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    window.removeEventListener('resize', this.onWindowResize);
    this.stage?.destroy();
    this.stage = undefined;
    if (this.mapImageObjectUrl) {
      URL.revokeObjectURL(this.mapImageObjectUrl);
      this.mapImageObjectUrl = undefined;
    }

    try {
      // Fetched together so the fog/lighting state is already correct for the first paint in
      // buildStage()'s fitToContainer() — fetching either only after the map/image are ready would briefly
      // render the map fully unfogged/unlit (spoiling hidden areas) until the data caught up.
      const [map, fog, lighting] = await Promise.all([
        this.mapService.getMap(id),
        this.mapService.getFog(id),
        this.mapService.getLighting(id),
      ]);
      this.map.set(map);
      this.fog.set(fog);
      this.lighting.set(lighting);
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
    img.onerror = () => {
      this.error.set('Failed to load the map image.');
      this.loading.set(false);
    };
    void this.mapService.getMapImage(map.image_url).then((blob) => {
      this.mapImageObjectUrl = URL.createObjectURL(blob);
      img.src = this.mapImageObjectUrl;
    }).catch(() => {
      this.error.set('Failed to load the authorized map image.');
      this.loading.set(false);
    });
  }

  private buildStage() {
    const container = this.stageContainer.nativeElement;
    if (!container.clientWidth || !container.clientHeight) {
      requestAnimationFrame(() => this.buildStage());
      return;
    }

    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.mapLayer = new Konva.Layer();
    this.gridLayer = new Konva.Layer();
    this.fogLayer = new Konva.Layer();
    this.darknessLayer = new Konva.Layer();
    this.moveRangeLayer = new Konva.Layer();
    this.trailLayer = new Konva.Layer();
    this.planLayer = new Konva.Layer();
    this.tokenLayer = new Konva.Layer();
    this.lightMarkerLayer = new Konva.Layer();
    this.wallLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer();
    // Darkness (and each torch's glow) sits under the fog, so fogged areas hide lighting too.
    this.stage.add(
      this.mapLayer, this.gridLayer, this.darknessLayer, this.fogLayer, this.moveRangeLayer,
      this.trailLayer, this.planLayer, this.tokenLayer, this.lightMarkerLayer, this.wallLayer, this.measureLayer,
    );
    this.fogLayer.listening(false);
    this.darknessLayer.listening(false);
    this.moveRangeLayer.listening(false);
    this.measureLayer.listening(false);
    this.gridLayer.listening(false);
    this.wallLayer.listening(false);
    this.tokenLayer.listening(!this.isEditingWalls);
    this.lightMarkerLayer.listening(!this.isEditingWalls);

    this.konvaImg = new Konva.Image({ image: this.img!, x: 0, y: 0, width: 0, height: 0 });
    this.mapLayer.add(this.konvaImg);

    this.stage.on('click tap', (e) => {
      // Middle-click is reserved for camera panning (see StageView) — Konva fires 'click' for any
      // button whose down/up land on the same target, so without this a middle-click would also
      // place a torch or drop a new token here.
      if ('button' in e.evt && (e.evt as MouseEvent).button === 1) return;
      if (this.pickingDestination()) {
        // Anywhere on the map, including on top of another token's square. The tool stays armed
        // so the player can keep adjusting their pick; the flag button or Escape turns it off.
        const pos = this.stage!.getRelativePointerPosition()!;
        this.setMyPlan(Math.floor(pos.x / this.cellSize), Math.floor(pos.y / this.cellSize));
        return;
      }
      if (this.activeLightTool() === 'wall' && this.controlsMap()) {
        const point = wallPointUnderPointer(this.stage!, this.cellSize, !!(e.evt as MouseEvent).shiftKey);
        const wall = point && this.wallTool.addVertex(point);
        if (wall) this.commitWalls([...this.lighting().walls, wall]);
        this.renderWalls();
        return;
      }
      if (this.activeLightTool() === 'erase-wall' && this.controlsMap()) {
        const point = wallPointUnderPointer(this.stage!, this.cellSize, true);
        const walls = this.lighting().walls;
        const index = point ? wallIndexNear(walls, point) : -1;
        if (index >= 0) {
          this.wallTool.setEraseHover(-1);
          this.commitWalls(walls.filter((_, i) => i !== index));
        }
        return;
      }
      if (this.activeLightTool() === 'place' && this.controlsMap()) {
        if (e.target === this.konvaImg) {
          const pos = this.stage!.getRelativePointerPosition()!;
          this.placeLight({ x: pos.x / this.cellSize, y: pos.y / this.cellSize });
        } else {
          const tokenId = e.target.id();
          if (tokenId) this.placeLight({ token_id: tokenId });
        }
        return;
      }
      if (e.target === this.konvaImg && this.controlsMap() && !this.activeMeasureTool() && !this.activeFogTool() && !this.activeLightTool()) {
        const pos = this.stage!.getRelativePointerPosition()!;
        const col = Math.floor(pos.x / this.cellSize);
        const row = Math.floor(pos.y / this.cellSize);
        this.addTokenAt(col, row);
      }
    });

    // Wall tool hover: the rubber-band preview while chaining, the red highlight while erasing.
    this.stage.on('mousemove touchmove', (e) => {
      const tool = this.activeLightTool();
      if (tool === 'wall') {
        this.wallTool.setHover(wallPointUnderPointer(this.stage!, this.cellSize, !!(e.evt as MouseEvent).shiftKey));
        this.renderWalls();
      } else if (tool === 'erase-wall') {
        const point = wallPointUnderPointer(this.stage!, this.cellSize, true);
        this.wallTool.setEraseHover(point ? wallIndexNear(this.lighting().walls, point) : -1);
        this.renderWalls();
      }
    });
    // Right-click or double-click finishes the current wall chain.
    this.stage.on('contextmenu', (e) => {
      if (this.activeLightTool() !== 'wall') return;
      e.evt.preventDefault();
      this.wallTool.endChain();
      this.renderWalls();
    });
    this.stage.on('dblclick dbltap', () => {
      if (this.activeLightTool() !== 'wall') return;
      this.wallTool.endChain();
      this.renderWalls();
    });

    this.stageView = new StageView(this.stage, () => !this.activeFogTool() && !this.activeMeasureTool() && !this.activeLightTool());

    this.pointerTools = new StagePointerTools(this.stage, this.fogTool, this.measurementTool, {
      cellSize: () => this.cellSize,
      activeFogTool: () => this.activeFogTool(),
      activeMeasureTool: () => this.activeMeasureTool(),
      controlsMap: () => this.controlsMap(),
      onFogChanged: () => this.renderFog(),
      onMeasureChanged: () => this.renderMeasurements(),
      broadcastMeasure: measurement => this.mapService.sendMeasure(this.mapId, measurement),
    });

    this.tokenSub = this.mapService.watchTokens(this.mapId).subscribe(tokens => {
      this.tokens.set(tokens);
      this.lastTokens = tokens;
      this.renderTokens(tokens);
      this.renderTrail();
      // Also re-render darkness/markers — an attached light's position is derived from its
      // token, so a token move (broadcast here) needs to move its light too.
      this.renderDarkness();
      this.renderLightMarkers();
    });

    this.measureSub = this.mapService.watchMeasurements().subscribe(({ senderId, measurement }) => {
      this.measurementTool.setRemote(senderId, measurement);
      this.renderMeasurements();
    });

    this.fogSub = this.mapService.watchFog(this.mapId).subscribe(fog => {
      this.fog.set(fog);
      this.renderFog();
      this.renderLightMarkers();
    });

    this.lightingSub = this.mapService.watchLighting(this.mapId).subscribe(lighting => {
      const walls = this.pendingWalls ?? lighting.walls ?? [];
      this.lighting.set({ ...lighting, walls });
      this.renderDarkness();
      this.renderLightMarkers();
      this.renderWalls();
    });

    // Container-size changes that aren't window resizes — the player dragging the turn-order or
    // character-sheet resize handle, or collapsing/expanding a side column — only re-sync the
    // stage buffer; they must not rescale or recenter the map (see syncStageSize). A real
    // window resize refits, via the window 'resize' listener.
    this.resizeObserver = new ResizeObserver(() => this.syncStageSize());
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.onWindowResize);

    this.fitToContainer();
    this.stageView.centerOnHome();
    this.loading.set(false);
  }

  // Full fit-to-container: (re)computes the map's display scale, cell size and letterbox home,
  // then redraws every layer. Runs once on load and again on a real browser-window resize.
  private fitToContainer() {
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

    // Letterboxed when the image's aspect ratio doesn't match the container's — center the map
    // in the leftover space rather than pinning it to the top-left corner.
    this.stageView?.setHome({ x: (container.clientWidth - w) / 2, y: (container.clientHeight - h) / 2 });

    drawGrid(this.gridLayer!, w, h, this.cellSize);
    this.renderFog();
    this.renderTokens(this.lastTokens);
    this.renderDarkness();
    this.renderLightMarkers();
    this.renderWalls();
    renderMoveRange(this.moveRangeLayer!, this.cellSize, this.showMoveRange(), this.moveRangeOrigin(), this.moveRangeFt());
    this.renderTrail();
    this.renderPlan();
  }

  // The map container changed size without the window resizing (a side panel was resized or
  // collapsed). Keep the Konva stage's drawing buffer matched to the element — so pointer math
  // and clipping stay correct — but leave the map's scale, cell size and position alone: the
  // panel just reveals more or less of the same map. "Fit map" / a window resize still refit.
  private syncStageSize() {
    const container = this.stageContainer.nativeElement;
    if (!this.stage || !container.clientWidth || !container.clientHeight) return;
    if (this.stage.width() === container.clientWidth && this.stage.height() === container.clientHeight) return;
    this.stage.width(container.clientWidth);
    this.stage.height(container.clientHeight);
    this.stage.batchDraw();
  }

  private renderFog() {
    const layer = this.fogLayer;
    if (!layer) return;
    this.fogTool.render(
      layer, this.fog(), this.controlsMap(), this.img, this.gridSize, this.cellSize,
      this.activeFogTool() === 'reveal-rect',
    );
  }

  private renderDarkness() {
    const layer = this.darknessLayer;
    if (!layer) return;
    const lighting = this.lighting();
    const personal = this.personalDarkvisionLight();
    // Spliced in only for this render call — never touches the `lighting` signal itself, so it's
    // never persisted, broadcast, shown in the light editor, or visible on anyone else's screen.
    const effective = personal ? { ...lighting, lights: [...lighting.lights, personal] } : lighting;
    renderDarkness(layer, effective, this.lastTokens, this.controlsMap(), this.img, this.gridSize, this.cellSize);
  }

  // Darkvision has no "bright" zone in 5e — it sees as if in dim light throughout its whole
  // range — so this reuses the same bright/dim radial-falloff punch a torch's dim ring already
  // gets, just with bright_radius_ft pinned to 0. token_id ties it to the viewer's own token so
  // it tracks that token's live position (including mid-drag) exactly like an attached torch does.
  private personalDarkvisionLight(): MapLight | null {
    const token = this.myToken();
    const ft = this.myDarkvisionFt();
    if (!token?.id || !ft) return null;
    return {
      token_id: token.id,
      map_id: this.mapId,
      bright_radius_ft: 0,
      dim_radius_ft: ft,
      color: '#ffffff',
      enabled: true,
      label: 'Darkvision',
    };
  }

  private renderLightMarkers() {
    const layer = this.lightMarkerLayer;
    if (!layer) return;
    // Markers are visible to every viewer (a lit torch is something anyone in the room would see)
    // — only the DM's view gets click/drag/delete wired up, via `interactive` below.
    const fog = this.fog();
    const hiddenCells = !this.controlsMap() && fog.enabled ? new Set(fog.hidden_cells) : null;
    renderLightMarkers(layer, this.lighting(), this.lastTokens, this.cellSize, this.selectedLightId(), this.controlsMap(), hiddenCells, {
      onLightClick: light => this.selectLight(light),
      onLightDragEnd: (light, col, row) => this.moveLight(light, col, row),
      onLightContextMenu: light => this.removeLight(light),
    });
  }

  // Walls are an editing overlay: only the DM sees them, and only while a lighting tool is armed
  // — during play their effect shows up in the darkness itself.
  private renderWalls() {
    const layer = this.wallLayer;
    if (!layer) return;
    const visible = this.controlsMap() && !!this.activeLightTool();
    this.wallTool.render(layer, this.lighting().walls, this.cellSize, visible);
  }

  private renderTokens(tokens: MapToken[]) {
    const layer = this.tokenLayer;
    if (!layer) return;
    if (this.tokenHeld) {
      this.tokenRenderPending = true;
      return;
    }
    this.tokenRenderPending = false;
    renderTokens(layer, tokens, {
      cellSize: this.cellSize,
      fog: this.fog(),
      isAdmin: this.controlsMap(),
      activeMeasureTool: this.activeMeasureTool(),
      currentTurnTokenId: this.currentTurnTokenId(),
      selectedTokenId: this.selectedTokenId(),
      characterHp: this.characterHp(),
      characterPortraits: this.resolvePortraitImages(this.characterPortraits()),
      tokenImages: this.tokenImageCache.resolve(tokens, () => this.renderTokens(this.lastTokens)),
      hiddenTokenIds: this.tokensHiddenByDarkness(),
      onTokenClick: token => {
        this.selectedTokenId.set(token.id ?? null);
        this.tokenClicked.emit(token);
      },
      onTokenPress: () => {
        this.tokenHeld = true;
      },
      onTokenMoved: (token, col, row) => {
        // Shown on its snapped square right away rather than wherever it was let go of, until
        // the server's tokens_updated broadcast confirms (or, on failure, restores) it. The
        // token layer itself redraws on release (onPointerRelease), right after this dragend.
        this.lastTokens = this.lastTokens.map(t => t.id === token.id ? { ...t, x: col, y: row } : t);
        this.tokenRenderPending = true;
        this.selectedTokenId.set(token.id ?? null);
        this.renderTrail();
        this.renderDarkness();
        this.renderLightMarkers();
        this.mapService.upsertToken({ ...token, x: col, y: row }).catch(() => {
          this.lastTokens = this.tokens();
          this.renderTokens(this.lastTokens);
          this.renderTrail();
        });
      },
      onTokenContextMenu: token => this.removeToken(token),
      onTokenDragMove: (token, xPx, yPx) => {
        // Purely local — no network call. Keeps a light attached to this token tracking the
        // drag live instead of only snapping into place once tokens_updated round-trips back
        // from the server at dragend. Self-heals: the next tokens_updated broadcast overwrites
        // this temporary mutation with the server's canonical positions.
        const gx = xPx / this.cellSize - token.size / 2;
        const gy = yPx / this.cellSize - token.size / 2;
        this.lastTokens = this.lastTokens.map(t => t.id === token.id ? { ...t, x: gx, y: gy } : t);
        this.renderDarkness();
        this.renderLightMarkers();
        // Same snapping as the drop itself (token-renderer's dragend). `token` is the position
        // the server last saved, not the live one just written into lastTokens above.
        this.renderTrail(token, {
          xPx, yPx,
          col: snapToCell(xPx, token.size, this.cellSize),
          row: snapToCell(yPx, token.size, this.cellSize),
        });
      },
    });
  }

  // The current-turn token's starting square and distance moved this turn, when it's on this map,
  // plus — while `dragged` is mid-drag — a preview of that move. A token that isn't taking its
  // turn (or any token outside an encounter) is measured from where it was picked up.
  private renderTrail(dragged?: MapToken, drag?: TrailDrag) {
    const layer = this.trailLayer;
    if (!layer || !this.cellSize) return;
    const speedFor = (token: MapToken) =>
      token.character_id && token.character_id === this.myCharacterId() ? this.myMoveSpeedFt() : null;
    const trails: Trail[] = [];
    const current = this.tokens().find(t => t.id === this.currentTurnTokenId());
    // An enemy in the dark leaves no visible trail either.
    if (current && current.id !== dragged?.id && !this.tokensHiddenByDarkness().has(current.id!)) {
      trails.push({ token: current, speedFt: speedFor(current), ...this.moveActions(current) });
    }
    if (dragged && drag) {
      const onTurn = dragged.id === this.currentTurnTokenId() && dragged.turn_start_x != null;
      const token = onTurn ? dragged : {
        ...dragged, turn_start_x: dragged.x, turn_start_y: dragged.y,
        turn_anchor_x: dragged.x, turn_anchor_y: dragged.y, turn_moved_ft: 0, turn_diagonals: 0,
      };
      trails.push({ token, drag, speedFt: speedFor(dragged) });
    }
    renderTurnTrails(layer, trails, {
      cellSize: this.cellSize,
      fog: this.fog(),
      isAdmin: this.controlsMap(),
    });
  }

  // The DM's Confirm/Undo buttons for the current-turn token's pending move.
  private moveActions(token: MapToken): Pick<Trail, 'onConfirm' | 'onUndo'> {
    if (!this.controlsMap() || !token.id) return {};
    const mapId = token.map_id ?? this.mapId;
    return {
      onConfirm: () => this.mapService.confirmTokenMove(mapId, token.id!),
      onUndo: () => this.mapService.undoTokenMove(mapId, token.id!),
    };
  }

  private renderPlan() {
    const layer = this.planLayer;
    if (!layer || !this.cellSize) return;
    const plan = this.planMarker();
    // The DM accepts a player's pick by clicking it: the token moves there like a normal drag.
    const accept = plan && this.controlsMap()
      ? () => this.mapService.upsertToken({ ...plan.token, x: plan.x, y: plan.y })
      : undefined;
    renderPlanMarker(layer, this.cellSize, plan, accept);
  }

  // With darkness on, a player only sees an enemy standing in light — a torch's reach or their own
  // darkvision, stopped by walls, the same areas renderDarkness reveals. Party members are always
  // shown, like with fog. The DM sees everything.
  private tokensHiddenByDarkness(): Set<string> {
    const hidden = new Set<string>();
    const lighting = this.lighting();
    if (this.controlsMap() || !lighting.enabled || !this.cellSize) return hidden;
    const personal = this.personalDarkvisionLight();
    const lights = personal ? [...lighting.lights, personal] : lighting.lights;
    const areas = litAreas({ ...lighting, lights }, this.lastTokens, this.cellSize);
    for (const token of this.lastTokens) {
      if (!token.is_player && token.id && !isTokenLit(token, areas, this.cellSize)) hidden.add(token.id);
    }
    return hidden;
  }

  private resolvePortraitImages(sources: Record<string, PortraitSource>): Record<string, HTMLImageElement> {
    return this.portraitCache.resolve(sources, () => this.renderTokens(this.lastTokens));
  }

  private renderMeasurements() {
    const layer = this.measureLayer;
    if (!layer) return;
    this.measurementTool.render(layer, this.cellSize);
  }

  // Uses the narrower setTokenColor endpoint rather than upsertToken: works for a player who
  // doesn't otherwise have write access to this map, as long as it's their own character's token.
  async setMyTokenColor(color: string) {
    const token = this.myToken();
    if (!token?.id) return;
    await this.mapService.setTokenColor(this.mapId, token.id, color);
  }

  async removeToken(token: MapToken) {
    if (!await this.confirm.confirm(`Remove "${token.label ?? 'this token'}" from the map?`, 'Remove Token', 'Remove')) return;
    await this.mapService.deleteToken(token.id!, token.map_id ?? this.mapId);
  }

  async setInitiative(token: MapToken, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Math.floor(Number(trimmed));
    if (trimmed !== '' && Number.isNaN(value)) return;
    if (value === (token.initiative ?? null)) return;
    await this.mapService.upsertToken({ ...token, initiative: value });
  }

  async rerollInitiative(token: MapToken) {
    await this.mapService.rerollInitiative(token.map_id ?? this.mapId, token.id!);
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
