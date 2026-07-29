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
import { MapToken, BattleMap, PlacingEntity } from '../../core/models/campaign.model';
import { ConfirmService } from '../../shared/confirm.service';

@Component({
  selector: 'app-battle-map',
  imports: [RouterLink, FormsModule, MatIconModule, MatTooltipModule],
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
  // Fired when an already-placed token is clicked, so an embedding parent can show its stat block/HP.
  readonly tokenClicked = output<MapToken>();

  mapService = inject(BattleMapService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);

  map = signal<BattleMap | null>(null);
  tokens = signal<MapToken[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  newToken = { label: 'Token', color: '#e74c3c', size: 1, is_player: false };

  // The token list re-sorted by initiative, highest first, with unrolled tokens sorted last.
  turnOrder = computed(() => {
    return [...this.tokens()].sort((a, b) => {
      if (a.initiative == null && b.initiative == null) return 0;
      if (a.initiative == null) return 1;
      if (b.initiative == null) return -1;
      return b.initiative - a.initiative;
    });
  });

  private stage?: Konva.Stage;
  private mapLayer?: Konva.Layer;
  private tokenLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;
  private tokenSub?: Subscription;
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

    // A character's HP changing (e.g. the DM adjusting it from the roster's character sheet)
    // doesn't touch the token list itself, so it needs its own redraw trigger.
    effect(() => {
      this.characterHp();
      if (this.tokenLayer && this.cellSize) {
        this.renderTokens(this.lastTokens, this.cellSize);
      }
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
    this.stage?.destroy();
  }

  private async loadMap(id: string) {
    this.mapId = id;
    this.loading.set(true);
    this.error.set(null);
    this.tokenSub?.unsubscribe();
    this.tokenSub = undefined;
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
    const container = this.stageContainer.nativeElement;
    const gridSize = map.grid_size || 50;

    const img = new Image();
    img.onload = () => {
      const scale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
      this.mapLayer = new Konva.Layer();
      this.gridLayer = new Konva.Layer();
      this.tokenLayer = new Konva.Layer();
      this.stage.add(this.mapLayer, this.gridLayer, this.tokenLayer);

      // Grid lines are purely decorative — nothing on this layer is ever clicked or dragged.
      // Konva otherwise assigns every shape a unique hit-test color, and a grid can easily be
      // hundreds of lines; browsers with canvas anti-fingerprinting ("farbling", e.g. Firefox's
      // resistFingerprinting, or Brave) perturb the hit-canvas pixels enough that Konva can't
      // read back the color it just assigned, so it keeps retrying and warning per shape — which
      // can make the whole board janky or unresponsive. Marking the layer non-listening skips hit
      // registration for all of it.
      this.gridLayer.listening(false);

      const konvaImg = new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h });
      this.mapLayer.add(konvaImg);
      this.drawGrid(w, h, gridSize * scale);
      this.cellSize = gridSize * scale;

      this.stage.on('click tap', (e) => {
        if (e.target === konvaImg && this.auth.isAdmin()) {
          const pos = this.stage!.getPointerPosition()!;
          const col = Math.floor(pos.x / (gridSize * scale));
          const row = Math.floor(pos.y / (gridSize * scale));
          this.addTokenAt(col, row, gridSize * scale);
        }
      });

      this.tokenSub = this.mapService.watchTokens(this.mapId).subscribe(tokens => {
        this.tokens.set(tokens);
        this.lastTokens = tokens;
        this.renderTokens(tokens, gridSize * scale);
      });

      this.loading.set(false);
    };
    // Without this, a broken/missing image URL (moved upload, wrong host, etc.) leaves the view
    // stuck on the loading spinner forever with no indication anything went wrong.
    img.onerror = () => {
      this.error.set('Failed to load the map image.');
      this.loading.set(false);
    };
    img.src = map.image_url;
  }

  private drawGrid(w: number, h: number, cellSize: number) {
    const layer = this.gridLayer!;
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
      // particular default to it even when the regular window doesn't). Konva reuses this same
      // sceneFunc for hit-testing by default (swapping in the shape's assigned hit color), so
      // click/drag/tap behave exactly as before with no separate hitFunc needed.
      const shape = new Konva.Shape({
        x: cx,
        y: cy,
        draggable: this.auth.isAdmin(),
        sceneFunc: context => {
          context.beginPath();
          context.arc(0, 0, r - 3, 0, Math.PI * 2);
          context.closePath();
          context.fillStyle = token.color;
          context.fill();
          context.lineWidth = 2;
          context.strokeStyle = '#fff';
          context.stroke();

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
