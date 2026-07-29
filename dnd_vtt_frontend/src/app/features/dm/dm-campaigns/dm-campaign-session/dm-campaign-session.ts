import { Component, ElementRef, ViewChild, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import Konva from 'konva';
import { EncounterService } from '../../../../core/services/encounter.service';
import { ContentService, DndMonster } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { SessionService } from '../../../../core/services/session.service';
import { Encounter } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { BattleMap, UniversalVTTData } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';

@Component({
  selector: 'app-dm-campaign-session',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent],
  templateUrl: './dm-campaign-session.html',
  // Routed in via dm-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0/overflow-y-auto root div has no
  // bounded parent to size against — it just grows to content height instead of filling the
  // screen. Same fix as DmCampaignHubComponent / PlayerCampaignSessionComponent.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmCampaignSessionComponent implements OnInit, OnDestroy {
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;

  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private encounterService  = inject(EncounterService);
  private content           = inject(ContentService);
  private characterService  = inject(CharacterService);
  private mapService        = inject(BattleMapService);
  private sessionService    = inject(SessionService);
  private confirm           = inject(ConfirmService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  sessionId  = this.route.snapshot.paramMap.get('sessionId')!;

  session    = signal<Session | null>(null);
  encounters = signal<Encounter[]>([]);
  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  descriptionDraft    = '';
  savingDescription   = signal(false);
  uploadingBackground = signal(false);

  // A plain method, not computed() — descriptionDraft is an ngModel-bound field, not a signal, so
  // a computed() here would only re-evaluate when the session() signal changes and would ignore
  // every keystroke, leaving the Save button's [disabled] stuck at its first-render value.
  descriptionDirty(): boolean {
    return this.descriptionDraft.trim() !== (this.session()?.description ?? '').trim();
  }

  showForm  = signal(false);
  saving    = signal(false);
  editingId = signal<string | null>(null);

  name = '';
  summary = '';
  existingMap = signal<BattleMap | null>(null);
  uploadError     = signal<string | null>(null);
  parsingFile     = signal(false);
  imagePreviewUrl = signal<string | null>(null);
  pixelsPerGrid   = signal(0);
  mapCols         = signal(0);
  mapRows         = signal(0);
  private mapFile: File | null = null;

  selectedMonsterIndices = signal<Set<string>>(new Set());
  selectedCharacterIds   = signal<Set<string>>(new Set());

  monsterSearchQuery = signal('');
  filteredMonsters = computed(() => {
    const query = this.monsterSearchQuery().trim().toLowerCase();
    if (!query) return this.monsters();
    return this.monsters().filter(m => m.name.toLowerCase().includes(query));
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
    const [session, encounters, monsters, characters] = await Promise.all([
      this.sessionService.getById(this.sessionId),
      this.encounterService.getBySession(this.sessionId),
      this.content.getMonsters(),
      this.characterService.getMyCharacters(),
    ]);
    this.session.set(session);
    this.descriptionDraft = session.description ?? '';
    this.encounters.set(encounters);
    this.monsters.set(monsters);
    this.characters.set(characters);
    this.loading.set(false);
  }

  async saveDescription() {
    this.savingDescription.set(true);
    try {
      this.session.set(await this.sessionService.update(this.sessionId, { description: this.descriptionDraft.trim() }));
    } finally {
      this.savingDescription.set(false);
    }
  }

  async onBackgroundFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackground.set(true);
    try {
      this.session.set(await this.sessionService.uploadBackground(this.sessionId, file));
    } finally {
      this.uploadingBackground.set(false);
    }
  }

  async clearBackground() {
    this.session.set(await this.sessionService.update(this.sessionId, { background_url: null }));
  }

  ngOnDestroy() {
    this.stage?.destroy();
  }

  backToHub() {
    void this.router.navigate(['/dm/campaigns', this.campaignId]);
  }

  startCreate() {
    this.resetForm();
    this.showForm.set(true);
  }

  async startEdit(encounter: Encounter) {
    this.resetForm();
    this.editingId.set(encounter.id!);
    this.name = encounter.name;
    this.summary = encounter.summary ?? '';
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
      let map_id = this.existingMap()?.id;
      if (this.mapFile) {
        const image_url = await this.mapService.uploadMapImage(this.mapFile, this.campaignId);
        const map = await this.mapService.createMap({
          campaign_id: this.campaignId,
          name: this.name.trim(),
          image_url,
          grid_size: this.pixelsPerGrid() || 50,
        });
        map_id = map.id;
      }

      const payload = {
        name: this.name.trim(),
        session_id: this.sessionId,
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

      this.showForm.set(false);
      this.resetForm();
      this.encounters.set(await this.encounterService.getBySession(this.sessionId));
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
    this.encounters.set(await this.encounterService.getBySession(this.sessionId));
  }

  async toggleVisibility(encounter: Encounter, event: Event) {
    event.stopPropagation();
    await this.encounterService.setVisibility(encounter.id!, !encounter.visible_to_players);
    this.encounters.set(await this.encounterService.getBySession(this.sessionId));
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
    this.summary = '';
    this.uploadError.set(null);
    this.imagePreviewUrl.set(null);
    this.mapFile = null;
    this.pixelsPerGrid.set(0);
    this.mapCols.set(0);
    this.mapRows.set(0);
    this.selectedMonsterIndices.set(new Set());
    this.selectedCharacterIds.set(new Set());
    this.monsterSearchQuery.set('');
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
