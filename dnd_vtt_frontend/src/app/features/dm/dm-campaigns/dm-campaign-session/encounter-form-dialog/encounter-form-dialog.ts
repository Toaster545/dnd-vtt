import { Component, ElementRef, ViewChild, inject, signal, computed, effect, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Konva from 'konva';
import { EncounterService } from '../../../../../core/services/encounter.service';
import { BattleMapService } from '../../../../../core/services/battle-map.service';
import { DndMonster } from '../../../../../core/services/content.service';
import { Encounter } from '../../../../../core/models/encounter.model';
import { Character } from '../../../../../core/models/character.model';
import { BattleMap, UniversalVTTData } from '../../../../../core/models/campaign.model';

export interface EncounterFormDialogData {
  campaignId: string;
  sessionId: string;
  monsters: DndMonster[];
  characters: Character[];
  // Present when editing an existing encounter, absent when creating a new one.
  encounter?: Encounter | null;
}

// Popup counterpart of what used to be DmCampaignSessionComponent's inline "showForm" card —
// moved wholesale into a MatDialog so opening it doesn't shove the encounter list down the page.
// Closes with `true` (something was saved, the caller should refetch its encounter list) or
// `false`/undefined (cancelled, nothing changed).
@Component({
  selector: 'app-encounter-form-dialog',
  imports: [FormsModule, MatIconModule, MatTooltipModule, MatDialogModule],
  templateUrl: './encounter-form-dialog.html',
})
export class EncounterFormDialogComponent implements OnInit, OnDestroy {
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;

  private dialogRef       = inject<MatDialogRef<EncounterFormDialogComponent, boolean>>(MatDialogRef);
  readonly data           = inject<EncounterFormDialogData>(MAT_DIALOG_DATA);
  private encounterService = inject(EncounterService);
  private mapService       = inject(BattleMapService);

  saving    = signal(false);
  editingId = signal<string | null>(this.data.encounter?.id ?? null);

  name = this.data.encounter?.name ?? '';
  summary = this.data.encounter?.summary ?? '';
  existingMap = signal<BattleMap | null>(null);
  // All maps already uploaded to this campaign — offered as a picker so an encounter can reuse
  // one instead of forcing a fresh upload every time. Loaded once in ngOnInit.
  campaignMaps = signal<BattleMap[]>([]);
  uploadError     = signal<string | null>(null);
  parsingFile     = signal(false);
  imagePreviewUrl = signal<string | null>(null);
  pixelsPerGrid   = signal(0);
  mapCols         = signal(0);
  mapRows         = signal(0);
  // Which kind of file supplied the current preview — 'dd2vtt' has exact grid metadata baked in;
  // 'image' is a plain PNG/JPEG/WebP where the grid is derived from `verticalSquares` below (same
  // approach as DmCampaignMapsComponent) since there's no embedded resolution to read.
  mapKind = signal<'dd2vtt' | 'image' | null>(null);
  verticalSquares = 20;
  // Signal (not a plain field) so the template can tell "existing map picked" from "new file
  // pending upload" — e.g. to keep the picker's selected-highlight and the "current map" info box
  // in sync with which source is actually about to be saved.
  mapFile = signal<File | null>(null);
  private imgNaturalWidth = 0;
  private imgNaturalHeight = 0;

  selectedMonsterIndices = signal<Set<string>>(new Set(this.data.encounter?.monsters ?? []));
  selectedCharacterIds   = signal<Set<string>>(new Set(this.data.encounter?.character_ids ?? []));

  monsterSearchQuery = signal('');
  filteredMonsters = computed(() => {
    const query = this.monsterSearchQuery().trim().toLowerCase();
    if (!query) return this.data.monsters;
    return this.data.monsters.filter(m => m.name.toLowerCase().includes(query));
  });

  private stage?: Konva.Stage;
  private imageLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;

  constructor() {
    effect(() => {
      const url = this.imagePreviewUrl();
      const cell = this.pixelsPerGrid();
      if (url && cell > 0) this.renderPreview(url, cell);
    });
  }

  async ngOnInit() {
    this.campaignMaps.set(await this.mapService.getMapsForCampaign(this.data.campaignId));
    const mapId = this.data.encounter?.map_id;
    if (mapId) {
      // Reuse the picker's logic so an encounter's already-attached map renders in the visualizer
      // immediately, the same as freshly selecting it from the "uploaded maps" list would.
      await this.selectExistingMap(await this.mapService.getMap(mapId));
    }
  }

  ngOnDestroy() {
    this.stage?.destroy();
  }

  cancel() {
    this.dialogRef.close(false);
  }

  // Picks a map already uploaded to this campaign instead of uploading a new file — save() then
  // just reuses existingMap()'s id as map_id, same as when editing an encounter that already had
  // a map attached. Clears any in-progress file upload so the two sources of truth can't collide.
  // Also feeds imagePreviewUrl/pixelsPerGrid so the same Konva grid preview used for fresh
  // uploads renders the selected map too, instead of only showing its name.
  async selectExistingMap(map: BattleMap) {
    this.existingMap.set(map);
    this.mapFile.set(null);
    this.mapKind.set(null);
    this.uploadError.set(null);
    this.pixelsPerGrid.set(map.grid_size);
    try {
      const { width, height } = await this.readImageDimensions(map.image_url);
      this.mapCols.set(map.grid_size > 0 ? Math.round(width / map.grid_size) : 0);
      this.mapRows.set(map.grid_size > 0 ? Math.round(height / map.grid_size) : 0);
    } catch {
      this.mapCols.set(0);
      this.mapRows.set(0);
    }
    this.imagePreviewUrl.set(map.image_url);
  }

  // Dropdown's (ngModelChange) handler — resolves the picked id back to a BattleMap and reuses
  // selectExistingMap, or clears the selection entirely for the "— none —" option.
  onExistingMapSelect(id: string) {
    if (!id) { this.clearMapSelection(); return; }
    const map = this.campaignMaps().find(m => m.id === id);
    if (map) void this.selectExistingMap(map);
  }

  clearMapSelection() {
    this.existingMap.set(null);
    this.mapFile.set(null);
    this.imagePreviewUrl.set(null);
    this.mapKind.set(null);
    this.pixelsPerGrid.set(0);
    this.mapCols.set(0);
    this.mapRows.set(0);
    // imagePreviewUrl going null doesn't re-render (renderPreview only draws, never clears), so
    // drop the stage outright — it's cheaply recreated by the effect next time a preview is set.
    this.stage?.destroy();
    this.stage = undefined;
    this.imageLayer = undefined;
    this.gridLayer = undefined;
  }

  async onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadError.set(null);
    this.parsingFile.set(true);

    try {
      // Plain raster images (from any map tool, not just Dungeondraft) have no embedded grid
      // metadata — those go through the vertical-squares flow below. Anything else is assumed to
      // be a Dungeondraft Universal VTT export, which carries its own exact pixels_per_grid.
      if (file.type.startsWith('image/')) {
        await this.loadPlainImage(file);
      } else {
        await this.loadDd2vtt(file);
      }
    } catch {
      this.uploadError.set(
        'Could not read this file. Upload a PNG, JPEG, WebP image, or a DungeonDraft Universal VTT (.dd2vtt) export.',
      );
      this.imagePreviewUrl.set(null);
      this.mapKind.set(null);
      this.mapFile.set(null);
      input.value = '';
    } finally {
      this.parsingFile.set(false);
    }
  }

  private async loadDd2vtt(file: File) {
    const data: UniversalVTTData = JSON.parse(await file.text());
    if (!data.image || !data.resolution?.pixels_per_grid) throw new Error('missing image/grid data');

    this.mapKind.set('dd2vtt');
    this.pixelsPerGrid.set(Math.round(data.resolution.pixels_per_grid));
    this.mapCols.set(data.resolution.map_size?.x ?? 0);
    this.mapRows.set(data.resolution.map_size?.y ?? 0);

    const dataUrl = `data:image/png;base64,${data.image}`;
    this.mapFile.set(await this.dataUrlToFile(dataUrl, 'map.png'));
    this.imagePreviewUrl.set(dataUrl);
  }

  private async loadPlainImage(file: File) {
    const dataUrl = await this.fileToDataUrl(file);
    const { width, height } = await this.readImageDimensions(dataUrl);
    this.imgNaturalWidth = width;
    this.imgNaturalHeight = height;
    this.mapKind.set('image');
    this.mapFile.set(file);
    this.recomputeImageGrid();
    this.imagePreviewUrl.set(dataUrl);
  }

  // Re-derives the pixel grid size from the uploaded image's real height and the requested row
  // count — called after load and whenever the DM tweaks the "Vertical Grid Squares" field.
  recomputeImageGrid() {
    if (this.mapKind() !== 'image' || !this.imgNaturalHeight || this.verticalSquares <= 0) return;
    const cell = Math.round(this.imgNaturalHeight / this.verticalSquares);
    this.pixelsPerGrid.set(cell);
    this.mapRows.set(this.verticalSquares);
    this.mapCols.set(cell > 0 ? Math.round(this.imgNaturalWidth / cell) : 0);
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  private readImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not read image dimensions.'));
      img.src = url;
    });
  }

  private renderPreview(url: string, cellSize: number) {
    const container = this.previewContainer?.nativeElement;
    if (!container) return;

    const img = new Image();
    img.onload = () => {
      const scale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;

      if (!this.stage) {
        this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
        this.imageLayer = new Konva.Layer();
        this.gridLayer = new Konva.Layer();
        this.stage.add(this.imageLayer, this.gridLayer);
        // Purely decorative preview grid — see the identical fix/comment in BattleMapComponent.
        this.gridLayer.listening(false);
      }

      this.imageLayer!.destroyChildren();
      this.imageLayer!.add(new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h }));
      this.imageLayer!.draw();

      this.gridLayer!.destroyChildren();
      const cell = cellSize * scale;
      // Single shape drawing the whole grid itself — see the identical fix/comment on
      // BattleMapComponent.drawGrid; one Konva.Line per gridline could freeze the tab on browsers
      // with canvas anti-fingerprinting protection.
      this.gridLayer!.add(new Konva.Shape({
        listening: false,
        stroke: 'rgba(255,255,255,0.35)',
        strokeWidth: 1,
        sceneFunc: (context, shape) => {
          context.beginPath();
          for (let x = 0; x <= w; x += cell) {
            context.moveTo(x, 0);
            context.lineTo(x, h);
          }
          for (let y = 0; y <= h; y += cell) {
            context.moveTo(0, y);
            context.lineTo(w, y);
          }
          context.strokeShape(shape);
        },
      }));
      this.gridLayer!.draw();
    };
    img.src = url;
  }

  isMonsterSelected(index: string): boolean {
    return this.selectedMonsterIndices().has(index);
  }

  toggleMonster(index: string) {
    this.selectedMonsterIndices.update(set => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  isCharacterSelected(id: string): boolean {
    return this.selectedCharacterIds().has(id);
  }

  toggleCharacter(id: string) {
    this.selectedCharacterIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async save() {
    if (!this.name.trim()) return;
    this.saving.set(true);
    try {
      let map_id = this.existingMap()?.id;
      if (this.mapFile()) {
        const image_url = await this.mapService.uploadMapImage(this.mapFile()!, this.data.campaignId);
        const map = await this.mapService.createMap({
          campaign_id: this.data.campaignId,
          name: this.name.trim(),
          image_url,
          grid_size: this.pixelsPerGrid() || 50,
        });
        map_id = map.id;
      }

      const payload = {
        name: this.name.trim(),
        session_id: this.data.sessionId,
        map_id,
        monsters: [...this.selectedMonsterIndices()],
        character_ids: [...this.selectedCharacterIds()],
        summary: this.summary.trim(),
      };

      const editingId = this.editingId();
      if (editingId) {
        await this.encounterService.update(editingId, payload);
      } else {
        await this.encounterService.create(payload);
      }

      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }

  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  }
}
