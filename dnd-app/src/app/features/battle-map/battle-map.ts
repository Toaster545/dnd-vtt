import {
  Component, ElementRef, inject, signal, OnInit, OnDestroy, AfterViewInit, ViewChild
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { BattleMapService } from '../../core/services/battle-map.service';
import { AuthService } from '../../core/services/auth.service';
import { MapToken, BattleMap } from '../../core/models/campaign.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-battle-map',
  imports: [RouterLink, FormsModule],
  templateUrl: './battle-map.html',
  styleUrl: './battle-map.scss',
})
export class BattleMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stageContainer') stageContainer!: ElementRef<HTMLDivElement>;

  mapService = inject(BattleMapService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  map = signal<BattleMap | null>(null);
  tokens = signal<MapToken[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  newToken = { label: 'Token', color: '#e74c3c', size: 1, is_player: false };
  selectedTokenId = signal<string | null>(null);

  private stage?: Konva.Stage;
  private mapLayer?: Konva.Layer;
  private tokenLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;
  private tokenSub?: Subscription;
  private mapId!: string;

  async ngOnInit() {
    this.mapId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.mapId) { this.loading.set(false); return; }

    try {
      const map = await this.mapService.getMap(this.mapId);
      this.map.set(map);
    } catch (e: any) {
      this.error.set(e.message);
      this.loading.set(false);
    }
  }

  ngAfterViewInit() {
    if (this.map()) this.initStage();
  }

  ngOnDestroy() {
    this.tokenSub?.unsubscribe();
    this.stage?.destroy();
  }

  private async initStage() {
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

      const konvaImg = new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h });
      this.mapLayer.add(konvaImg);

      this.drawGrid(w, h, gridSize * scale);

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
        this.renderTokens(tokens, gridSize * scale);
      });

      this.loading.set(false);
    };
    img.src = map.image_url;
  }

  private drawGrid(w: number, h: number, cellSize: number) {
    const layer = this.gridLayer!;
    for (let x = 0; x <= w; x += cellSize) {
      layer.add(new Konva.Line({ points: [x, 0, x, h], stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }));
    }
    for (let y = 0; y <= h; y += cellSize) {
      layer.add(new Konva.Line({ points: [0, y, w, y], stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }));
    }
    layer.draw();
  }

  private renderTokens(tokens: MapToken[], cellSize: number) {
    const layer = this.tokenLayer!;
    layer.destroyChildren();

    for (const token of tokens) {
      const r = (cellSize * token.size) / 2;
      const cx = token.x * cellSize + r;
      const cy = token.y * cellSize + r;

      const group = new Konva.Group({ x: cx, y: cy, draggable: this.auth.isAdmin() });

      group.add(new Konva.Circle({ radius: r - 3, fill: token.color, stroke: '#fff', strokeWidth: 2 }));
      group.add(new Konva.Text({
        text: token.label.substring(0, 3).toUpperCase(),
        fontSize: r * 0.7,
        fill: '#fff',
        align: 'center',
        verticalAlign: 'middle',
        offsetX: r * 0.7 / 2 * 1.5,
        offsetY: r * 0.7 / 2,
      }));

      if (token.max_hp != null) {
        const hpRatio = (token.hp ?? token.max_hp) / token.max_hp;
        group.add(new Konva.Rect({ x: -r, y: r - 6, width: cellSize * token.size - 6, height: 5, fill: '#333', cornerRadius: 2 }));
        group.add(new Konva.Rect({ x: -r, y: r - 6, width: (cellSize * token.size - 6) * hpRatio, height: 5, fill: hpRatio > 0.5 ? '#27ae60' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c', cornerRadius: 2 }));
      }

      if (this.auth.isAdmin()) {
        group.on('dragend', async () => {
          const pos = group.position();
          const col = Math.floor(pos.x / cellSize);
          const row = Math.floor(pos.y / cellSize);
          await this.mapService.upsertToken({ ...token, x: col, y: row });
        });

        group.on('contextmenu', async (e) => {
          e.evt.preventDefault();
          await this.mapService.deleteToken(token.id!);
        });
      }

      layer.add(group);
    }

    layer.draw();
  }

  private async addTokenAt(col: number, row: number, _cellSize: number) {
    const token: MapToken = {
      map_id: this.mapId,
      label: this.newToken.label,
      color: this.newToken.color,
      x: col,
      y: row,
      size: this.newToken.size,
      is_player: this.newToken.is_player,
    };
    await this.mapService.upsertToken(token);
  }
}
