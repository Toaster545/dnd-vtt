import { Component, ElementRef, ViewChild, inject, signal, effect, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import Konva from 'konva';
import { EncounterService } from '../../../../core/services/encounter.service';
import { ContentService, DndMonster } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { Encounter } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { BattleMap, UniversalVTTData } from '../../../../core/models/campaign.model';
import { ConfirmService } from '../../../../shared/confirm.service';

// Maps created here aren't tied to a real campaign concept yet — matches the map-manager's
// existing use of a hardcoded 'default' campaign id.
const CAMPAIGN_ID = 'default';

@Component({
  selector: 'app-dm-encounters',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './dm-encounters.html',
})
export class DmEncountersComponent implements OnInit, OnDestroy {
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;

  private encounterService = inject(EncounterService);
  private content          = inject(ContentService);
  private characterService = inject(CharacterService);
  private mapService       = inject(BattleMapService);
  private confirm          = inject(ConfirmService);

  encounters = signal<Encounter[]>([]);
  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  showForm  = signal(false);
  saving    = signal(false);
  // Non-null while editing an existing encounter rather than creating a new one — drives the
  // form's title/submit label and whether `save()` calls update() vs create().
  editingId = signal<string | null>(null);

  name = '';
  // The encounter's current map when editing one that already has one — shown as a reference
  // (name/thumbnail/grid) unless the DM picks a new .dd2vtt file to replace it.
  existingMap = signal<BattleMap | null>(null);
  // A DungeonDraft "Universal VTT" export (.dd2vtt) is a JSON file bundling a base64 image plus
  // resolution.pixels_per_grid — so the grid cell size comes straight from the file instead of
  // being calibrated by hand (see `UniversalVTTData` in campaign.model.ts).
  uploadError     = signal<string | null>(null);
  parsingFile     = signal(false);
  imagePreviewUrl = signal<string | null>(null);
  pixelsPerGrid   = signal(0);
  mapCols         = signal(0);
  mapRows         = signal(0);
  // The decoded image, ready to upload — computed once at file-select time (see onFileChange),
  // not at Submit time.
  private mapFile: File | null = null;

  selectedMonsterIndices = signal<Set<string>>(new Set());
  selectedCharacterIds   = signal<Set<string>>(new Set());

  private stage?: Konva.Stage;
  private imageLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;

  constructor() {
    // Redraws the grid overlay whenever a new file is parsed, using the pixels_per_grid it embeds.
    effect(() => {
      const url = this.imagePreviewUrl();
      const cell = this.pixelsPerGrid();
      if (url && cell > 0) this.renderPreview(url, cell);
    });
  }

  async ngOnInit() {
    const [encounters, monsters, characters] = await Promise.all([
      this.encounterService.getAll(),
      this.content.getMonsters(),
      this.characterService.getMyCharacters(),
    ]);
    this.encounters.set(encounters);
    this.monsters.set(monsters);
    this.characters.set(characters);
    this.loading.set(false);
  }

  ngOnDestroy() {
    this.stage?.destroy();
  }

  startCreate() {
    this.resetForm();
    this.showForm.set(true);
  }

  async startEdit(encounter: Encounter) {
    this.resetForm();
    this.editingId.set(encounter.id!);
    this.name = encounter.name;
    this.selectedMonsterIndices.set(new Set(encounter.monsters));
    this.selectedCharacterIds.set(new Set(encounter.character_ids));
    if (encounter.map_id) {
      this.existingMap.set(await this.mapService.getMap(encounter.map_id));
    }
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.resetForm();
  }

  async onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadError.set(null);
    this.parsingFile.set(true);

    try {
      let data: UniversalVTTData;
      try {
        data = JSON.parse(await file.text());
        if (!data.image || !data.resolution?.pixels_per_grid) throw new Error('missing image/grid data');
      } catch {
        this.uploadError.set('Could not read this as a DungeonDraft Universal VTT (.dd2vtt) export.');
        this.imagePreviewUrl.set(null);
        this.mapFile = null;
        input.value = '';
        return;
      }

      this.pixelsPerGrid.set(Math.round(data.resolution.pixels_per_grid));
      this.mapCols.set(data.resolution.map_size?.x ?? 0);
      this.mapRows.set(data.resolution.map_size?.y ?? 0);

      // Decode the (often tens-of-MB) base64 image to a real File right away, while the DM is
      // already waiting on the file picker — not later at Submit, which used to make clicking
      // "Create"/"Save" feel like it was hanging on a huge image it hadn't touched yet.
      const dataUrl = `data:image/png;base64,${data.image}`;
      this.mapFile = await this.dataUrlToFile(dataUrl, 'map.png');
      this.imagePreviewUrl.set(dataUrl);
    } finally {
      this.parsingFile.set(false);
    }
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
      }

      this.imageLayer!.destroyChildren();
      this.imageLayer!.add(new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h }));
      this.imageLayer!.draw();

      this.gridLayer!.destroyChildren();
      const cell = cellSize * scale;
      for (let x = 0; x <= w; x += cell) {
        this.gridLayer!.add(new Konva.Line({ points: [x, 0, x, h], stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 }));
      }
      for (let y = 0; y <= h; y += cell) {
        this.gridLayer!.add(new Konva.Line({ points: [0, y, w, y], stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 }));
      }
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
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  isCharacterSelected(id: string): boolean {
    return this.selectedCharacterIds().has(id);
  }

  toggleCharacter(id: string) {
    this.selectedCharacterIds.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async save() {
    if (!this.name.trim()) return;
    this.saving.set(true);
    try {
      // A newly picked file always wins; otherwise keep whatever map (if any) the encounter
      // already had — editing monsters/characters shouldn't silently detach the map.
      let map_id = this.existingMap()?.id;
      if (this.mapFile) {
        const image_url = await this.mapService.uploadMapImage(this.mapFile, CAMPAIGN_ID);
        const map = await this.mapService.createMap({
          campaign_id: CAMPAIGN_ID,
          name: this.name.trim(),
          image_url,
          grid_size: this.pixelsPerGrid() || 50,
        });
        map_id = map.id;
      }

      const payload = {
        name: this.name.trim(),
        map_id,
        monsters: [...this.selectedMonsterIndices()],
        character_ids: [...this.selectedCharacterIds()],
      };

      const editingId = this.editingId();
      if (editingId) {
        await this.encounterService.update(editingId, payload);
      } else {
        await this.encounterService.create(payload);
      }

      this.showForm.set(false);
      this.resetForm();
      this.encounters.set(await this.encounterService.getAll());
    } finally {
      this.saving.set(false);
    }
  }

  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  }

  async deleteEncounter(id: string) {
    const enc = this.encounters().find(e => e.id === id);
    if (!await this.confirm.confirm(`Delete "${enc?.name ?? 'this encounter'}"? This cannot be undone.`, 'Delete Encounter')) return;
    await this.encounterService.remove(id);
    this.encounters.set(await this.encounterService.getAll());
  }

  monsterName(index: string): string {
    return this.monsters().find(m => m.index === index)?.name ?? index;
  }

  characterName(id: string): string {
    return this.characters().find(c => c.id === id)?.name ?? 'Unknown';
  }

  private resetForm() {
    this.editingId.set(null);
    this.existingMap.set(null);
    this.name = '';
    this.uploadError.set(null);
    this.imagePreviewUrl.set(null);
    this.mapFile = null;
    this.pixelsPerGrid.set(0);
    this.mapCols.set(0);
    this.mapRows.set(0);
    this.selectedMonsterIndices.set(new Set());
    this.selectedCharacterIds.set(new Set());
    this.stage?.destroy();
    this.stage = undefined;
    this.imageLayer = undefined;
    this.gridLayer = undefined;
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
