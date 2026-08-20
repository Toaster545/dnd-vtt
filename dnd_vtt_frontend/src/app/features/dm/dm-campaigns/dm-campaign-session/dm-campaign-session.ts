import { Component, ElementRef, ViewChild, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import Konva from 'konva';
import { EncounterService } from '../../../../core/services/encounter.service';
import { ContentService, DndMonster } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterStatsService } from '../../../../core/services/character-stats.service';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { SessionService } from '../../../../core/services/session.service';
import { CampaignService } from '../../../../core/services/campaign.service';
import { ClassChoiceSource } from '../../../../core/utils/character-effects';
import { campaignContentEnabled } from '../../../../core/utils/content-sources';
import { Encounter } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { BattleMap, CampaignMember, UniversalVTTData } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';
import { PartyListComponent } from '../../../../shared/components/party-list/party-list';
import { CharacterWizardComponent } from '../../../characters/character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { DescriptionDialogComponent } from '../../../../shared/components/description-dialog/description-dialog';

function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-dm-campaign-session',
  imports: [
    FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent, PartyListComponent,
    CharacterWizardComponent, CharacterPlaySheetComponent,
  ],
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
  private statsService      = inject(CharacterStatsService);
  private mapService        = inject(BattleMapService);
  private sessionService    = inject(SessionService);
  private campaignService   = inject(CampaignService);
  private confirm           = inject(ConfirmService);
  private dialog            = inject(MatDialog);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  sessionId  = this.route.snapshot.paramMap.get('sessionId')!;

  session    = signal<Session | null>(null);
  encounters = signal<Encounter[]>([]);
  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  members    = signal<CampaignMember[]>([]);
  loading    = signal(true);

  // Same live-recomputed HP as DmCampaignHubComponent.memberMaxHp — kept here too so the party
  // tab reads identically on both pages instead of falling back to the member's stored (possibly
  // stale) character_max_hp.
  memberMaxHp = signal<Record<string, number>>({});

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter   = signal<Character | null>(null);

  uploadingBackground = signal(false);

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
  // Which kind of file supplied the current preview — 'dd2vtt' has exact grid metadata baked in;
  // 'image' is a plain PNG/JPEG/WebP where the grid is derived from `verticalSquares` below (same
  // approach as DmCampaignMapsComponent) since there's no embedded resolution to read.
  mapKind = signal<'dd2vtt' | 'image' | null>(null);
  verticalSquares = 20;
  private mapFile: File | null = null;
  private imgNaturalWidth = 0;
  private imgNaturalHeight = 0;

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
    const [session, encounters, monsters, characters, campaign, sources] = await Promise.all([
      this.sessionService.getById(this.sessionId),
      this.encounterService.getBySession(this.sessionId),
      this.content.getMonsters(this.campaignId),
      this.characterService.getMyCharacters(),
      this.campaignService.getById(this.campaignId),
      this.content.getSources(),
    ]);
    this.session.set(session);
    this.encounters.set(encounters);
    const allowed = new Set(campaign.allowed_sources);
    this.monsters.set(monsters.filter(monster => campaignContentEnabled(monster, allowed, sources)));
    this.characters.set(characters);
    this.members.set(campaign.members);
    this.loading.set(false);
    void this.loadMemberMaxHp(campaign.members);
  }

  // Re-fetches the roster after a management action (edit access/visibility/remove) or a
  // character save — mirrors DmCampaignHubComponent.load()'s member-refresh half, without
  // touching this page's own `loading`/encounters state.
  private async refreshMembers() {
    const campaign = await this.campaignService.getById(this.campaignId);
    this.members.set(campaign.members);
    void this.loadMemberMaxHp(campaign.members);
  }

  private async loadMemberMaxHp(members: CampaignMember[]) {
    const entries = await Promise.all(members.map(async (member) => {
      try {
        const char = await this.characterService.getCharacter(member.character_id);
        const [classData, raceData, backgroundData, feats, items] = await Promise.all([
          this.content.getClass(toContentIndex(char.class)).catch(() => null),
          this.content.getRace(toContentIndex(char.race)).catch(() => null),
          this.content.getBackground(toContentIndex(char.background)).catch(() => null),
          this.content.getFeats(),
          this.content.getItems(this.campaignId),
        ]);
        const primary = char.classes?.[0];
        const classesForFeats: ClassChoiceSource[] = classData ? [{
          data: classData,
          choices: primary?.choices ?? {},
          level: primary?.level ?? char.level,
          subclass: primary?.subclass ?? char.subclass,
        }] : [];
        const stats = this.statsService.compute(
          char, classData, raceData, feats, classesForFeats, items, backgroundData,
        );
        return [member.character_id, stats.suggested_max_hp] as const;
      } catch {
        return null;
      }
    }));
    const map: Record<string, number> = {};
    for (const entry of entries) if (entry) map[entry[0]] = entry[1];
    this.memberMaxHp.set(map);
  }

  // Opens the DM's editable view of a player's campaign copy — same flow as
  // DmCampaignHubComponent.openMember.
  async openMember(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    await this.refreshMembers();
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  // Quick view/edit of HP, rest, equipment, and spell prep — same as
  // DmCampaignHubComponent.viewMember.
  async viewMember(member: CampaignMember) {
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    await this.refreshMembers();
  }

  closeCharacterSheet() {
    this.sheetCharacter.set(null);
  }

  async toggleEditAccess(member: CampaignMember) {
    await this.campaignService.setMemberEditAccess(this.campaignId, member.user_id, !member.edit_unlocked);
    await this.refreshMembers();
  }

  async togglePartyVisibility(member: CampaignMember) {
    await this.campaignService.setMemberPartyVisibility(
      this.campaignId,
      member.user_id,
      member.visible_to_party === false,
    );
    await this.refreshMembers();
  }

  async removeMember(userId: string, name: string) {
    if (!await this.confirm.confirm(`Remove ${name} from this campaign? They can rejoin later with the campaign code.`, 'Remove Player')) return;
    await this.campaignService.removeMember(this.campaignId, userId);
    await this.refreshMembers();
  }

  async openDescriptionDialog() {
    const description: string | undefined = await firstValueFrom(
      this.dialog.open(DescriptionDialogComponent, {
        data: {
          title: 'Session Description',
          description: this.session()?.description ?? '',
          placeholder: "What's this session about…",
        },
        width: '480px',
      }).afterClosed(),
    );
    if (description === undefined) return;
    this.session.set(await this.sessionService.update(this.sessionId, { description: description.trim() }));
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
    void this.router.navigate(['/home/campaigns/manage', this.campaignId]);
  }

  startCreate() {
    this.resetForm();
    this.showForm.set(true);
  }

  async startEdit(encounter: Encounter, event: Event) {
    event.stopPropagation();
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
      this.mapFile = null;
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
    this.mapFile = await this.dataUrlToFile(dataUrl, 'map.png');
    this.imagePreviewUrl.set(dataUrl);
  }

  private async loadPlainImage(file: File) {
    const dataUrl = await this.fileToDataUrl(file);
    const { width, height } = await this.readImageDimensions(dataUrl);
    this.imgNaturalWidth = width;
    this.imgNaturalHeight = height;
    this.mapKind.set('image');
    this.mapFile = file;
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

  async deleteEncounter(id: string, event: Event) {
    event.stopPropagation();
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
    this.mapKind.set(null);
    this.verticalSquares = 20;
    this.imgNaturalWidth = 0;
    this.imgNaturalHeight = 0;
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
