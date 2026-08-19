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
  MapToken, BattleMap, MapFog, MapLight, MapLighting, PlacingEntity, MeasureShape, FogToolName, LightToolName,
} from '../../core/models/campaign.model';
import { ConfirmService } from '../../shared/confirm.service';
import { ResizeHandleDirective } from '../../shared/directives/resize-handle.directive';
import { drawGrid } from './canvas/grid-renderer';
import { renderMoveRange } from './canvas/move-range-renderer';
import { renderTokens } from './canvas/token-renderer';
import { renderDarkness, renderLightMarkers } from './canvas/lighting-renderer';
import { getErrorMessage } from '../../core/utils/error-message';
import { MeasurementTool } from './canvas/measurement-tool';
import { FogTool } from './canvas/fog-tool';
import { PortraitCache } from './canvas/portrait-cache';
import { PortraitSource } from '../../core/models/avatar.model';
import { StagePointerTools } from './canvas/stage-pointer-tools';
import { StageView } from './canvas/stage-view';
import { MapToolbarComponent } from './components/map-toolbar/map-toolbar';
import { TurnOrderPanelComponent } from './components/turn-order-panel/turn-order-panel';
import { LightEditorPanelComponent } from './components/light-editor-panel/light-editor-panel';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { PageHeaderComponent } from '../../shared/layout/page-header/page-header';

@Component({
  selector: 'app-battle-map',
  imports: [
    ResizeHandleDirective, MapToolbarComponent, TurnOrderPanelComponent, LightEditorPanelComponent,
    MainLayoutComponent, PageHeaderComponent, MatIconModule, MatTooltipModule,
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
  readonly myCharacterId = input<string | null>(null);
  readonly myMoveSpeedFt = input<number | null>(null);
  // Personal, not shared — only ever set on the viewing player's own component instance (see
  // player-campaign-session.ts), never broadcast. Punches a viewer-only hole in *this browser's*
  // darkness render around the player's own token; nobody else's screen is affected by it.
  readonly myDarkvisionFt = input<number | null>(null);
  readonly canControl = input<boolean | null>(null);
  readonly tokenClicked = output<MapToken>();
  readonly currentTurnTokenChanged = output<MapToken | null>();

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

  rightAsideWidth = signal(256);

  onRightAsideResize(dx: number) {
    this.rightAsideWidth.update(w => Math.min(420, Math.max(220, w - dx)));
  }

  activeMeasureTool = signal<MeasureShape | null>(null);

  toggleMeasureTool(shape: MeasureShape) {
    this.activeMeasureTool.update(current => current === shape ? null : shape);
    if (this.activeMeasureTool()) { this.activeFogTool.set(null); this.activeLightTool.set(null); }
  }

  fog = signal<MapFog>({ enabled: false, hidden_cells: [] });
  activeFogTool = signal<FogToolName | null>(null);

  toggleFogTool(tool: FogToolName) {
    this.activeFogTool.update(current => current === tool ? null : tool);
    if (this.activeFogTool()) { this.activeMeasureTool.set(null); this.activeLightTool.set(null); }
  }

  lighting = signal<MapLighting>({ enabled: false, lights: [] });
  activeLightTool = signal<LightToolName | null>(null);
  selectedLightId = signal<string | null>(null);
  selectedLight = computed(() => this.lighting().lights.find(l => l.id === this.selectedLightId()) ?? null);

  toggleLightTool() {
    this.activeLightTool.update(current => current === 'place' ? null : 'place');
    if (this.activeLightTool()) { this.activeMeasureTool.set(null); this.activeFogTool.set(null); }
  }

  selectPointerTool() {
    this.activeMeasureTool.set(null);
    this.activeFogTool.set(null);
    this.activeLightTool.set(null);
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
      bright_radius_ft: 20,
      dim_radius_ft: 20,
      color: '#ffa542',
      enabled: true,
      label: 'Torch',
      ...fields,
    });
  }

  showMoveRange = signal(false);

  myToken = computed(() => this.tokens().find(t => t.character_id === this.myCharacterId()) ?? null);
  private moveRangeFt = computed(() => this.myMoveSpeedFt() ?? 0);

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
  private darknessLayer?: Konva.Layer;
  private lightMarkerLayer?: Konva.Layer;
  private measureLayer?: Konva.Layer;
  private moveRangeLayer?: Konva.Layer;
  private konvaImg?: Konva.Image;
  private img?: HTMLImageElement;
  private gridSize = 50;
  private resizeObserver?: ResizeObserver;
  private tokenSub?: Subscription;
  private measureSub?: Subscription;
  private fogSub?: Subscription;
  private lightingSub?: Subscription;
  private measurementTool = new MeasurementTool();
  private fogTool = new FogTool((cells, revealed) => this.mapService.paintFog(this.mapId, cells, revealed));
  private pointerTools?: StagePointerTools;
  private stageView?: StageView;
  private mapId!: string;
  private routeMapId: string | null = null;
  private viewReady = signal(false);
  private loadedMapId: string | null = null;
  private cellSize = 0;
  private lastTokens: MapToken[] = [];
  private portraitCache = new PortraitCache();

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
      this.myToken();
      if (this.moveRangeLayer && this.cellSize && this.stage) {
        renderMoveRange(this.moveRangeLayer, this.cellSize, this.showMoveRange(), this.myToken(), this.moveRangeFt());
      }
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
        this.renderDarkness();
        this.renderLightMarkers();
      }
    });

    effect(() => {
      const canPan = !this.activeFogTool() && !this.activeMeasureTool() && !this.activeLightTool();
      this.stageView?.setPannable(canPan);
    });
  }

  ngOnInit() {
    this.routeMapId = this.route.snapshot.paramMap.get('id');
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  ngAfterViewInit() {
    this.viewReady.set(true);
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
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
    this.measurementTool.reset();
    this.fogTool.reset();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.stage?.destroy();
    this.stage = undefined;
    if (this.mapImageObjectUrl) {
      URL.revokeObjectURL(this.mapImageObjectUrl);
      this.mapImageObjectUrl = undefined;
    }

    try {
      // Fetched together so the fog/lighting state is already correct for the first paint in
      // buildStage()'s reflow() — fetching either only after the map/image are ready would briefly
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
    this.tokenLayer = new Konva.Layer();
    this.lightMarkerLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer();
    this.stage.add(
      this.mapLayer, this.gridLayer, this.fogLayer, this.darknessLayer, this.moveRangeLayer,
      this.tokenLayer, this.lightMarkerLayer, this.measureLayer,
    );
    this.fogLayer.listening(false);
    this.darknessLayer.listening(false);
    this.moveRangeLayer.listening(false);
    this.measureLayer.listening(false);
    this.gridLayer.listening(false);

    this.konvaImg = new Konva.Image({ image: this.img!, x: 0, y: 0, width: 0, height: 0 });
    this.mapLayer.add(this.konvaImg);

    this.stage.on('click tap', (e) => {
      // Middle-click is reserved for camera panning (see StageView) — Konva fires 'click' for any
      // button whose down/up land on the same target, so without this a middle-click would also
      // place a torch or drop a new token here.
      if ('button' in e.evt && (e.evt as MouseEvent).button === 1) return;
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
    });

    this.lightingSub = this.mapService.watchLighting(this.mapId).subscribe(lighting => {
      this.lighting.set(lighting);
      this.renderDarkness();
      this.renderLightMarkers();
    });

    this.resizeObserver = new ResizeObserver(() => this.reflow());
    this.resizeObserver.observe(container);

    this.reflow();
    this.stageView.centerOnHome();
    this.loading.set(false);
  }

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

    // Letterboxed when the image's aspect ratio doesn't match the container's — center the map
    // in the leftover space rather than pinning it to the top-left corner.
    this.stageView?.setHome({ x: (container.clientWidth - w) / 2, y: (container.clientHeight - h) / 2 });

    drawGrid(this.gridLayer!, w, h, this.cellSize);
    this.renderFog();
    this.renderTokens(this.lastTokens);
    this.renderDarkness();
    this.renderLightMarkers();
    renderMoveRange(this.moveRangeLayer!, this.cellSize, this.showMoveRange(), this.myToken(), this.moveRangeFt());
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
    renderLightMarkers(layer, this.lighting(), this.lastTokens, this.cellSize, this.selectedLightId(), this.controlsMap(), {
      onLightClick: light => this.selectLight(light),
      onLightDragEnd: (light, col, row) => this.moveLight(light, col, row),
      onLightContextMenu: light => this.removeLight(light),
    });
  }

  private renderTokens(tokens: MapToken[]) {
    const layer = this.tokenLayer;
    if (!layer) return;
    renderTokens(layer, tokens, {
      cellSize: this.cellSize,
      fog: this.fog(),
      isAdmin: this.controlsMap(),
      activeMeasureTool: this.activeMeasureTool(),
      currentTurnTokenId: this.currentTurnTokenId(),
      selectedTokenId: this.selectedTokenId(),
      characterHp: this.characterHp(),
      characterPortraits: this.resolvePortraitImages(this.characterPortraits()),
      onTokenClick: token => {
        this.selectedTokenId.set(token.id ?? null);
        this.tokenClicked.emit(token);
      },
      onTokenMoved: (token, col, row) => {
        this.selectedTokenId.set(token.id ?? null);
        return this.mapService.upsertToken({ ...token, x: col, y: row });
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
      },
    });
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
    await this.mapService.deleteToken(token.id!, this.mapId);
  }

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
