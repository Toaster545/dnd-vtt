import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../../../core/services/encounter.service';
import { ContentService, DndMonster } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Encounter, PresentPlayer } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { PortraitSource } from '../../../../core/models/avatar.model';
import { portraitSource } from '../../../../core/utils/avatar';
import { MapToken, PlacingEntity } from '../../../../core/models/campaign.model';
import { BattleMapComponent } from '../../../battle-map/battle-map';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { ResizeHandleDirective } from '../../../../shared/directives/resize-handle.directive';
import { EncounterToolbarComponent } from './components/encounter-toolbar/encounter-toolbar';
import { RosterPanelComponent } from './components/roster-panel/roster-panel';
import { CustomTokenEditorComponent } from './components/custom-token-editor/custom-token-editor';
import { MonsterTokenDetailComponent } from './components/monster-token-detail/monster-token-detail';
import { CharacterTokenDetailComponent } from './components/character-token-detail/character-token-detail';

@Component({
  selector: 'app-dm-encounter-play',
  imports: [
    FormsModule, MatIconModule, MatTooltipModule, BattleMapComponent, CharacterPlaySheetComponent, ResizeHandleDirective,
    EncounterToolbarComponent, RosterPanelComponent, CustomTokenEditorComponent, MonsterTokenDetailComponent,
    CharacterTokenDetailComponent,
  ],
  templateUrl: './dm-encounter-play.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmEncounterPlayComponent implements OnInit, OnDestroy {
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private encounterService = inject(EncounterService);
  private content          = inject(ContentService);
  private characterService = inject(CharacterService);
  private mapService       = inject(BattleMapService);
  private auth              = inject(AuthService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  sessionId  = this.route.snapshot.paramMap.get('sessionId')!;
  encounterId = this.route.snapshot.paramMap.get('encounterId')!;

  isOwner = computed(() => {
    const encounter = this.selected();
    const me = this.auth.profile();
    return !!encounter && !!me && encounter.dm_id === me.id;
  });

  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  selected = signal<Encounter | null>(null);
  togglingStatus = signal(false);

  currentTurnToken = signal<MapToken | null>(null);
  togglingTurn = signal(false);

  presentPlayers = signal<PresentPlayer[]>([]);
  private presenceSub?: Subscription;

  private extraCharacters = signal<Record<string, Character>>({});
  private hpPollInterval?: ReturnType<typeof setInterval>;

  armedEntity = signal<PlacingEntity | null>(null);

  rosterWidth = signal(288);

  onRosterResize(dx: number) {
    this.rosterWidth.update(w => Math.min(480, Math.max(220, w + dx)));
  }

  private allCharactersById = computed(() => {
    const map: Record<string, Character> = {};
    for (const c of this.characters()) if (c.id) map[c.id] = c;
    for (const [id, c] of Object.entries(this.extraCharacters())) map[id] = c;
    return map;
  });

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const c of Object.values(this.allCharactersById())) {
      if (c.id) map[c.id] = { hp: c.current_hp, max_hp: c.max_hp };
    }
    return map;
  });

  characterPortraits = computed(() => {
    const map: Record<string, PortraitSource> = {};
    for (const c of Object.values(this.allCharactersById())) {
      if (c.id) map[c.id] = portraitSource(c.portrait_seed || c.id, c.avatar_recipe);
    }
    return map;
  });

  viewingCharacter = signal<Character | null>(null);
  viewingCharacterToken = signal<MapToken | null>(null);
  viewingCharacterSummary = signal<{ token: MapToken; character: Character } | null>(null);
  viewingMonsterToken = signal<{ token: MapToken; monster: DndMonster } | null>(null);
  hpAdjustAmount = signal(0);
  viewingCustomToken = signal<MapToken | null>(null);

  showMonsterSearch  = signal(false);
  monsterSearchQuery = signal('');
  addingMonster      = signal(false);

  availableMonstersToAdd = computed(() => {
    const encounter = this.selected();
    const query = this.monsterSearchQuery().trim().toLowerCase();
    const existing = new Set(encounter?.monsters ?? []);
    return this.monsters()
      .filter(m => !existing.has(m.index))
      .filter(m => !query || m.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  rosterMonsters = computed(() => {
    const encounter = this.selected();
    return (encounter?.monsters ?? [])
      .map(index => this.monsterFor(index))
      .filter((m): m is DndMonster => !!m);
  });

  rosterCharacters = computed(() => {
    const encounter = this.selected();
    return (encounter?.character_ids ?? [])
      .map(id => this.characterFor(id))
      .filter((c): c is Character => !!c);
  });

  async ngOnInit() {
    const [encounter, monsters, characters] = await Promise.all([
      this.encounterService.getById(this.encounterId),
      this.content.getMonsters(this.campaignId),
      this.characterService.getMyCharacters(),
    ]);
    this.monsters.set(monsters);
    this.characters.set(characters);
    this.loading.set(false);

    this.selected.set(encounter);
    this.presenceSub = this.encounterService.watchPresence(encounter.id!)
      .subscribe(players => {
        this.presentPlayers.set(players);
        this.refreshPresentCharacters(players);
      });
    this.hpPollInterval = setInterval(() => this.refreshPresentCharacters(this.presentPlayers()), 6000);
  }

  backToSession() {
    void this.router.navigate(['/home/campaigns/manage', this.campaignId, 'sessions', this.sessionId]);
  }

  // Pops the read-only player view out into its own browser window/tab so the DM can drag it onto
  // a second monitor for the table to watch — see PlayerViewComponent.
  openPlayerView() {
    const encounter = this.selected();
    if (!encounter?.id) return;
    window.open(`/encounters/${encounter.id}/player-view`, '_blank', 'noopener,noreferrer');
  }

  ngOnDestroy() {
    this.presenceSub?.unsubscribe();
    clearInterval(this.hpPollInterval);
  }

  private async refreshPresentCharacters(players: PresentPlayer[]) {
    const ids = [...new Set(players.map(p => p.characterId).filter(Boolean))]
      .filter(id => !this.characters().some(c => c.id === id));
    if (!ids.length) return;
    const fetched = await Promise.all(ids.map(id => this.characterService.getCharacter(id).catch(() => null)));
    this.extraCharacters.update(map => {
      const next = { ...map };
      ids.forEach((id, i) => { const c = fetched[i]; if (c) next[id] = c; });
      return next;
    });
  }

  async startEncounter() {
    const encounter = this.selected();
    if (!encounter?.id) return;
    this.togglingStatus.set(true);
    try {
      this.selected.set(await this.encounterService.start(encounter.id));
    } finally {
      this.togglingStatus.set(false);
    }
  }

  async stopEncounter() {
    const encounter = this.selected();
    if (!encounter?.id) return;
    this.togglingStatus.set(true);
    try {
      this.selected.set(await this.encounterService.stop(encounter.id));
    } finally {
      this.togglingStatus.set(false);
    }
  }

  async nextTurn() {
    const encounter = this.selected();
    if (!encounter?.id) return;
    this.togglingTurn.set(true);
    try {
      this.selected.set(await this.encounterService.nextTurn(encounter.id));
    } finally {
      this.togglingTurn.set(false);
    }
  }

  async previousTurn() {
    const encounter = this.selected();
    if (!encounter?.id) return;
    this.togglingTurn.set(true);
    try {
      this.selected.set(await this.encounterService.previousTurn(encounter.id));
    } finally {
      this.togglingTurn.set(false);
    }
  }

  openMonsterSearch() {
    this.showMonsterSearch.set(true);
  }

  closeMonsterSearch() {
    this.showMonsterSearch.set(false);
    this.monsterSearchQuery.set('');
  }

  async addMonsterToEncounter(monster: DndMonster) {
    const encounter = this.selected();
    if (!encounter?.id || encounter.monsters.includes(monster.index)) return;
    this.addingMonster.set(true);
    try {
      this.selected.set(await this.encounterService.update(encounter.id, {
        monsters: [...encounter.monsters, monster.index],
      }));
    } finally {
      this.addingMonster.set(false);
    }
  }

  monsterFor(index: string): DndMonster | undefined {
    return this.monsters().find(m => m.index === index);
  }

  characterFor(id: string): Character | undefined {
    return this.allCharactersById()[id];
  }

  readonly classLabel = (c: Character): string => {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  };

  private monsterSizeCells(size: string): number {
    const s = size.toLowerCase();
    if (s.includes('gargantuan')) return 4;
    if (s.includes('huge')) return 3;
    if (s.includes('large')) return 2;
    return 1;
  }

  readonly isArmedMonster = (index: string): boolean => {
    const e = this.armedEntity();
    return !!e && e.kind === 'monster' && e.monsterIndex === index;
  };

  readonly isArmedCharacter = (id: string): boolean => {
    const e = this.armedEntity();
    return !!e && e.kind === 'character' && e.characterId === id;
  };

  isArmedCustomToken(): boolean {
    return this.armedEntity()?.kind === 'custom';
  }

  toggleArmCustomToken() {
    this.toggleArm({ kind: 'custom', label: 'New Token', color: '#94a3b8', size: 1 });
  }

  toggleArmMonster(monster: DndMonster) {
    this.toggleArm({
      kind: 'monster',
      label: monster.name,
      color: this.colorForMonster(monster.index),
      size: this.monsterSizeCells(monster.size),
      hp: monster.hit_points,
      max_hp: monster.hit_points,
      monsterIndex: monster.index,
    });
  }

  toggleArmCharacter(character: Character) {
    this.toggleArm({
      kind: 'character',
      label: character.name,
      color: this.colorFor(character.id!),
      size: 1,
      characterId: character.id,
    });
  }

  toggleArmPresentPlayer(player: PresentPlayer) {
    this.toggleArm({
      kind: 'character',
      label: player.characterName,
      color: this.colorFor(player.characterId),
      size: 1,
      characterId: player.characterId,
    });
  }

  private readonly palette = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#06b6d4', '#f97316', '#94a3b8'];
  private characterColorOverrides = signal<Record<string, string>>({});

  readonly colorFor = (characterId: string): string => {
    const override = this.characterColorOverrides()[characterId];
    if (override) return override;
    const idx = this.rosterIds().indexOf(characterId);
    return this.palette[idx >= 0 ? idx % this.palette.length : 0];
  };

  private rosterIds(): string[] {
    const fromRoster = this.selected()?.character_ids ?? [];
    const fromPresence = this.presentPlayers().map(p => p.characterId);
    return [...new Set([...fromRoster, ...fromPresence])];
  }

  setCharacterColor(characterId: string, color: string) {
    this.characterColorOverrides.update(map => ({ ...map, [characterId]: color }));
    const armed = this.armedEntity();
    if (armed?.kind === 'character' && armed.characterId === characterId) {
      this.armedEntity.set({ ...armed, color });
    }
  }

  private readonly monsterPalette = ['#e74c3c', '#f97316', '#c026d3', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#78716c'];
  private monsterColorOverrides = signal<Record<string, string>>({});

  readonly colorForMonster = (monsterIndex: string): string => {
    const override = this.monsterColorOverrides()[monsterIndex];
    if (override) return override;
    const defined = this.monsterFor(monsterIndex)?.color;
    if (defined) return defined;
    const idx = (this.selected()?.monsters ?? []).indexOf(monsterIndex);
    return this.monsterPalette[idx >= 0 ? idx % this.monsterPalette.length : 0];
  };

  setMonsterColor(monsterIndex: string, color: string) {
    this.monsterColorOverrides.update(map => ({ ...map, [monsterIndex]: color }));
    const armed = this.armedEntity();
    if (armed?.kind === 'monster' && armed.monsterIndex === monsterIndex) {
      this.armedEntity.set({ ...armed, color });
    }
  }

  private toggleArm(entity: PlacingEntity) {
    const current = this.armedEntity();
    const same = !!current && current.kind === entity.kind
      && (entity.kind === 'monster' ? current.monsterIndex === entity.monsterIndex : current.characterId === entity.characterId);
    this.armedEntity.set(same ? null : entity);
  }

  onTokenClicked(token: MapToken) {
    if (token.character_id) {
      const character = this.characterFor(token.character_id);
      if (character) this.viewingCharacterSummary.set({ token, character });
      return;
    }
    if (token.monster_index) {
      const monster = this.monsterFor(token.monster_index);
      if (monster) this.viewingMonsterToken.set({ token, monster });
      return;
    }
    this.viewingCustomToken.set(token);
  }

  closeCharacterSummary() {
    this.viewingCharacterSummary.set(null);
  }

  async setCharacterSummaryTokenColor(color: string) {
    const current = this.viewingCharacterSummary();
    if (!current) return;
    const updated = await this.mapService.upsertToken({ ...current.token, color });
    this.viewingCharacterSummary.set({ ...current, token: updated });
  }

  // The DM already has full write access to a party member's campaign copy (see
  // CharactersService.update's isOwningDm carve-out) — no separate permission plumbing needed.
  async setCharacterSummaryDarkvision(darkvision_ft: number | null) {
    const current = this.viewingCharacterSummary();
    if (!current) return;
    const updated = await this.characterService.saveCharacter({ ...current.character, darkvision_ft });
    this.viewingCharacterSummary.set({ ...current, character: updated });
  }

  openCharacterSheetFromSummary() {
    const current = this.viewingCharacterSummary();
    if (!current) return;
    this.viewingCharacter.set(current.character);
    this.viewingCharacterToken.set(current.token);
    this.viewingCharacterSummary.set(null);
  }

  closeCustomTokenView() {
    this.viewingCustomToken.set(null);
  }

  async setCustomTokenLabel(label: string) {
    const token = this.viewingCustomToken();
    if (!token || !label.trim()) return;
    this.viewingCustomToken.set(await this.mapService.upsertToken({ ...token, label: label.trim() }));
  }

  async setCustomTokenColor(color: string) {
    const token = this.viewingCustomToken();
    if (!token) return;
    this.viewingCustomToken.set(await this.mapService.upsertToken({ ...token, color }));
  }

  async setCustomTokenSize(size: number) {
    const token = this.viewingCustomToken();
    if (!token) return;
    this.viewingCustomToken.set(await this.mapService.upsertToken({ ...token, size }));
  }

  async removeCustomToken() {
    const token = this.viewingCustomToken();
    if (!token?.id) return;
    await this.mapService.deleteToken(token.id, token.map_id);
    this.viewingCustomToken.set(null);
  }

  async setCharacterTokenColor(color: string) {
    const token = this.viewingCharacterToken();
    if (!token) return;
    this.viewingCharacterToken.set(await this.mapService.upsertToken({ ...token, color }));
  }

  closeCharacterView() {
    this.viewingCharacter.set(null);
    this.viewingCharacterToken.set(null);
  }

  onCharacterSaved(character: Character) {
    this.viewingCharacter.set(character);
    if (character.id && this.extraCharacters()[character.id]) {
      this.extraCharacters.update(map => ({ ...map, [character.id!]: character }));
    } else {
      this.characters.update(list => list.map(c => c.id === character.id ? character : c));
    }
  }

  closeMonsterTokenView() {
    this.viewingMonsterToken.set(null);
    this.hpAdjustAmount.set(0);
  }

  setHpAdjustAmount(value: number) {
    this.hpAdjustAmount.set(Math.max(0, Math.floor(value || 0)));
  }

  async adjustMonsterTokenHp(delta: number) {
    const current = this.viewingMonsterToken();
    if (!current) return;
    const maxHp = current.token.max_hp ?? current.monster.hit_points;
    const currentHp = current.token.hp ?? maxHp;
    const next = Math.max(0, Math.min(maxHp, currentHp + delta));
    if (next === currentHp) return;
    const updated = await this.mapService.upsertToken({ ...current.token, hp: next });
    this.viewingMonsterToken.set({ token: updated, monster: current.monster });
  }

  async setMonsterTokenColor(color: string) {
    const current = this.viewingMonsterToken();
    if (!current) return;
    const updated = await this.mapService.upsertToken({ ...current.token, color });
    this.viewingMonsterToken.set({ token: updated, monster: current.monster });
  }
}
