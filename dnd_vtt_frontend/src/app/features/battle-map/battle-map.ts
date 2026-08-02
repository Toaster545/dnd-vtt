import {
  Component, ElementRef, inject, input, output, signal, computed, effect, OnInit, AfterViewInit, OnDestroy, ViewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { BattleMapService } from '../../core/services/battle-map.service';
import { AuthService } from '../../core/services/auth.service';
import { MapToken, BattleMap, MapFog, PlacingEntity, MeasureShape, FogToolName } from '../../core/models/campaign.model';
import { ConfirmService } from '../../shared/confirm.service';
import { ResizeHandleDirective } from '../../shared/directives/resize-handle.directive';
import { drawGrid } from './canvas/grid-renderer';
import { renderMoveRange } from './canvas/move-range-renderer';
import { renderTokens } from './canvas/token-renderer';
import { getErrorMessage } from '../../core/utils/error-message';
import { MeasurementTool, FEET_PER_SQUARE } from './canvas/measurement-tool';
import { FogTool } from './canvas/fog-tool';
import { PortraitCache } from './canvas/portrait-cache';
import { StagePointerTools } from './canvas/stage-pointer-tools';
import { MapToolbarComponent } from './components/map-toolbar/map-toolbar';
import { TurnOrderPanelComponent } from './components/turn-order-panel/turn-order-panel';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { PageHeaderComponent } from '../../shared/layout/page-header/page-header';

@Component({
  selector: 'app-battle-map',
  imports: [
    ResizeHandleDirective, MapToolbarComponent, TurnOrderPanelComponent,
    MainLayoutComponent, PageHeaderComponent,
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
  readonly characterPortraits = input<Record<string, string>>({});
  readonly currentTurnTokenId = input<string | null>(null);
  readonly myCharacterId = input<string | null>(null);
  readonly myMoveSpeedFt = input<number | null>(null);
  readonly canControl = input<boolean | null>(null);
  readonly tokenClicked = output<MapToken>();
  readonly currentTurnTokenChanged = output<MapToken | null>();

  mapService = inject(BattleMapService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);

  map = signal<BattleMap | null>(null);
  tokens = signal<MapToken[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedTokenId = signal<string | null>(null);

  newToken = { label: 'Token', color: '#e74c3c', size: 1, is_player: false };

  controlsMap = computed(() => this.canControl() ?? (!this.embedded() && this.auth.isAdmin()));

  rightAsideWidth = signal(256);

  onRightAsideResize(dx: number) {
    this.rightAsideWidth.update(w => Math.min(420, Math.max(220, w - dx)));
  }

  activeMeasureTool = signal<MeasureShape | null>(null);

  toggleMeasureTool(shape: MeasureShape) {
    this.activeMeasureTool.update(current => current === shape ? null : shape);
    if (this.activeMeasureTool()) this.activeFogTool.set(null);
  }

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

  showMoveRange = signal(false);

  myToken = computed(() => this.tokens().find(t => t.character_id === this.myCharacterId()) ?? null);
  private moveRangeSquares = computed(() => {
    const ft = this.myMoveSpeedFt();
    return ft ? Math.floor(ft / FEET_PER_SQUARE) : 0;
  });

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
  private resizeObserver?: ResizeObserver;
  private tokenSub?: Subscription;
  private measureSub?: Subscription;
  private fogSub?: Subscription;
  private measurementTool = new MeasurementTool();
  private fogTool = new FogTool((cells, revealed) => this.mapService.paintFog(this.mapId, cells, revealed));
  private pointerTools?: StagePointerTools;
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
        renderMoveRange(this.moveRangeLayer, this.stage, this.cellSize, this.showMoveRange(), this.myToken(), this.moveRangeSquares());
      }
    });

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
    img.onerror = () => {
      this.error.set('Failed to load the map image.');
      this.loading.set(false);
    };
    img.src = map.image_url;
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
    this.moveRangeLayer = new Konva.Layer();
    this.tokenLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer();
    this.stage.add(this.mapLayer, this.gridLayer, this.fogLayer, this.moveRangeLayer, this.tokenLayer, this.measureLayer);
    this.fogLayer.listening(false);
    this.moveRangeLayer.listening(false);
    this.measureLayer.listening(false);
    this.gridLayer.listening(false);

    this.konvaImg = new Konva.Image({ image: this.img!, x: 0, y: 0, width: 0, height: 0 });
    this.mapLayer.add(this.konvaImg);

    this.stage.on('click tap', (e) => {
      if (e.target === this.konvaImg && this.controlsMap() && !this.activeMeasureTool() && !this.activeFogTool()) {
        const pos = this.stage!.getPointerPosition()!;
        const col = Math.floor(pos.x / this.cellSize);
        const row = Math.floor(pos.y / this.cellSize);
        this.addTokenAt(col, row);
      }
    });

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
      layer, this.fog(), this.controlsMap(), this.img, this.gridSize, this.cellSize,
      this.activeFogTool() === 'reveal-rect',
    );
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
    });
  }

  private resolvePortraitImages(seeds: Record<string, string>): Record<string, HTMLImageElement> {
    return this.portraitCache.resolve(seeds, () => this.renderTokens(this.lastTokens));
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
