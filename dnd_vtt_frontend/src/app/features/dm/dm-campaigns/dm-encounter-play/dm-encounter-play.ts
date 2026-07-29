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
import { Encounter, PresentPlayer } from '../../../../core/models/encounter.model';
import { Character, ABILITY_SHORT, Ability } from '../../../../core/models/character.model';
import { MapToken, PlacingEntity } from '../../../../core/models/campaign.model';
import { BattleMapComponent } from '../../../battle-map/battle-map';
import { CharacterPlaySheetComponent } from '../../dm-play/character-play-sheet/character-play-sheet';
import { ResizeHandleDirective } from '../../../../shared/directives/resize-handle.directive';

@Component({
  selector: 'app-dm-encounter-play',
  imports: [FormsModule, MatIconModule, MatTooltipModule, BattleMapComponent, CharacterPlaySheetComponent, ResizeHandleDirective],
  templateUrl: './dm-encounter-play.html',
  // Routed in via dm-shell's <router-outlet> alongside the rest of /dm/campaigns/... — same sizing
  // fix as DmCampaignHubComponent/DmCampaignSessionComponent, needed for the embedded battle-map to
  // get a bounded height to fill instead of collapsing.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmEncounterPlayComponent implements OnInit, OnDestroy {
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private encounterService = inject(EncounterService);
  private content          = inject(ContentService);
  private characterService = inject(CharacterService);
  private mapService       = inject(BattleMapService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  sessionId  = this.route.snapshot.paramMap.get('sessionId')!;
  encounterId = this.route.snapshot.paramMap.get('encounterId')!;

  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  selected = signal<Encounter | null>(null);
  togglingStatus = signal(false);

  // Resolved from the battle-map's own token list via (currentTurnTokenChanged) — the encounter
  // record only carries the current turn's token id, not its name/color for display.
  currentTurnToken = signal<MapToken | null>(null);
  togglingTurn = signal(false);

  // Live "who's got this encounter open right now" — see EncounterPresenceGateway.
  presentPlayers = signal<PresentPlayer[]>([]);
  private presenceSub?: Subscription;

  // Full character records for present players the DM's own account doesn't own — fetched by id
  // (now allowed for admins, see CharactersService.findOneReadable) since presence only broadcasts
  // characterId/characterName, not stats/HP. Kept separate from `characters` (which stays strictly
  // "characters this DM account owns", used elsewhere e.g. picking an encounter's pre-built roster).
  private extraCharacters = signal<Record<string, Character>>({});
  private hpPollInterval?: ReturnType<typeof setInterval>;

  // Which roster entry is "armed" — clicking the map in the embedded battle-map places a token
  // built from this. Stays armed across repeated placements (see PlacingEntity in battle-map.ts).
  armedEntity = signal<PlacingEntity | null>(null);

  // Roster sidebar width, drag-resizable via the handle between it and the map (see
  // ResizeHandleDirective). Dragging right grows it, since the handle sits on its right edge.
  rosterWidth = signal(288);

  onRosterResize(dx: number) {
    this.rosterWidth.update(w => Math.min(480, Math.max(220, w + dx)));
  }

  // Every character the DM can currently see, DM-owned or a present player's own — the single
  // source `characterFor()` and `characterHp` both read from, so a joined player's token behaves
  // exactly like a pre-built roster one (viewable, HP shown, editable).
  private allCharactersById = computed(() => {
    const map: Record<string, Character> = {};
    for (const c of this.characters()) if (c.id) map[c.id] = c;
    for (const [id, c] of Object.entries(this.extraCharacters())) map[id] = c;
    return map;
  });

  // Live HP for every character above, keyed by id — fed to the battle-map so it can show HP over
  // a token without that HP having to be duplicated onto the token record itself.
  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const c of Object.values(this.allCharactersById())) {
      if (c.id) map[c.id] = { hp: c.current_hp, max_hp: c.max_hp };
    }
    return map;
  });

  // Portrait for every character above, keyed by id — same idea as characterHp, fed to the
  // battle-map so player tokens can render the character's face instead of a plain color fill.
  characterPortraits = computed(() => {
    const map: Record<string, string> = {};
    for (const c of Object.values(this.allCharactersById())) {
      if (c.id && c.portrait_seed) map[c.id] = c.portrait_seed;
    }
    return map;
  });

  // Clicking a character token takes over the whole detail area (map + roster hidden), matching
  // how the existing Characters play tab already does list→full-sheet.
  viewingCharacter = signal<Character | null>(null);
  // The specific token instance that was clicked to get here — kept separately from
  // viewingCharacter (a Character record, not a per-map placement) purely so the header's color
  // swatch has something to write to.
  viewingCharacterToken = signal<MapToken | null>(null);
  // Clicking a monster token instead just swaps the roster sidebar's own content — the map stays
  // visible, since a stat block is much narrower than the full character play sheet.
  viewingMonsterToken = signal<{ token: MapToken; monster: DndMonster } | null>(null);
  hpAdjustAmount = signal(0);
  // Clicking a token placed via the "add empty token" tool (no character_id/monster_index)
  // instead swaps the roster sidebar to a small name/color/size editor — same slot-in-place
  // pattern as viewingMonsterToken.
  viewingCustomToken = signal<MapToken | null>(null);

  // Adding a monster type to the encounter's roster mid-play (e.g. reinforcements) — a small
  // search box next to the "Monsters" header, filtered to types not already in the roster.
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

  async ngOnInit() {
    const [encounter, monsters, characters] = await Promise.all([
      this.encounterService.getById(this.encounterId),
      this.content.getMonsters(),
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
    // A present player can change their own HP from their own view mid-combat with nothing else
    // triggering a presence update — poll while the encounter's open so the board doesn't go stale
    // between joins/leaves.
    this.hpPollInterval = setInterval(() => this.refreshPresentCharacters(this.presentPlayers()), 6000);
  }

  backToSession() {
    void this.router.navigate(['/dm/campaigns', this.campaignId, 'sessions', this.sessionId]);
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

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  // Content JSON keys saving throws by full ability name ("Dexterity"), capitalized — lowercase
  // to key into ABILITY_SHORT and get the usual three-letter stat-block abbreviation instead.
  savingThrows(monster: DndMonster): string {
    const entries = Object.entries(monster.saving_throws ?? {});
    return entries
      .map(([ability, bonus]) => {
        const short = ABILITY_SHORT[ability.toLowerCase() as Ability] ?? ability.slice(0, 3).toUpperCase();
        return `${short} ${bonus >= 0 ? '+' : ''}${bonus}`;
      })
      .join(', ');
  }

  // Large/Huge/Gargantuan creatures occupy more than one grid cell; everything else (including
  // characters, always Small/Medium humanoids for token purposes) is a single cell.
  private monsterSizeCells(size: string): number {
    const s = size.toLowerCase();
    if (s.includes('gargantuan')) return 4;
    if (s.includes('huge')) return 3;
    if (s.includes('large')) return 2;
    return 1;
  }

  isArmedMonster(index: string): boolean {
    const e = this.armedEntity();
    return !!e && e.kind === 'monster' && e.monsterIndex === index;
  }

  isArmedCharacter(id: string): boolean {
    const e = this.armedEntity();
    return !!e && e.kind === 'character' && e.characterId === id;
  }

  isArmedCustomToken(): boolean {
    return this.armedEntity()?.kind === 'custom';
  }

  // "Add empty token" tool — arms a blank, unnamed token instead of one built from a roster
  // entry. Clicking the map drops it as-is; the DM then clicks the placed token to name it and
  // pick a color/size (see onTokenClicked/viewingCustomToken below), rather than being forced to
  // fill those in up front the way the roster-driven monster/character flow works.
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

  // A joined player's character isn't necessarily in the encounter's pre-built roster (they can
  // join with any character of theirs by code) — arming from presence only needs the id/name the
  // gateway already broadcasts, not a full Character record the DM may not even own/be able to load.
  toggleArmPresentPlayer(player: PresentPlayer) {
    this.toggleArm({
      kind: 'character',
      label: player.characterName,
      color: this.colorFor(player.characterId),
      size: 1,
      characterId: player.characterId,
    });
  }

  // A distinct default per player so tokens are tellable apart on the map without the DM having
  // to pick anything; DM overrides (via the swatch next to each roster row) stick per character
  // for the rest of the session and take priority once set. Indexed across both the pre-built
  // roster and whoever's actually joined live, so a player who joins with a character outside the
  // roster still gets a stable, distinct default instead of always falling back to palette[0].
  private readonly palette = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#06b6d4', '#f97316', '#94a3b8'];
  private characterColorOverrides = signal<Record<string, string>>({});

  colorFor(characterId: string): string {
    const override = this.characterColorOverrides()[characterId];
    if (override) return override;
    const idx = this.rosterIds().indexOf(characterId);
    return this.palette[idx >= 0 ? idx % this.palette.length : 0];
  }

  private rosterIds(): string[] {
    const fromRoster = this.selected()?.character_ids ?? [];
    const fromPresence = this.presentPlayers().map(p => p.characterId);
    return [...new Set([...fromRoster, ...fromPresence])];
  }

  setCharacterColor(characterId: string, color: string) {
    this.characterColorOverrides.update(map => ({ ...map, [characterId]: color }));
    // Re-arm with the new color immediately if this character is the one currently armed, so the
    // next map click doesn't place a token in the color it had a moment ago.
    const armed = this.armedEntity();
    if (armed?.kind === 'character' && armed.characterId === characterId) {
      this.armedEntity.set({ ...armed, color });
    }
  }

  // Same idea as the character palette above, but keyed by monster index (a type, not an
  // instance) — every hobgoblin placed from this roster row shares one color, chosen up front.
  private readonly monsterPalette = ['#e74c3c', '#f97316', '#c026d3', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#78716c'];
  private monsterColorOverrides = signal<Record<string, string>>({});

  colorForMonster(monsterIndex: string): string {
    const override = this.monsterColorOverrides()[monsterIndex];
    if (override) return override;
    // The monster's own wizard-set default, if it has one, beats the arbitrary palette fallback.
    const defined = this.monsterFor(monsterIndex)?.color;
    if (defined) return defined;
    const idx = (this.selected()?.monsters ?? []).indexOf(monsterIndex);
    return this.monsterPalette[idx >= 0 ? idx % this.monsterPalette.length : 0];
  }

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
      if (character) {
        this.viewingCharacter.set(character);
        this.viewingCharacterToken.set(token);
      }
      return;
    }
    if (token.monster_index) {
      const monster = this.monsterFor(token.monster_index);
      if (monster) this.viewingMonsterToken.set({ token, monster });
      return;
    }
    this.viewingCustomToken.set(token);
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

  setHpAdjustAmount(value: string) {
    this.hpAdjustAmount.set(Math.max(0, Math.floor(+value || 0)));
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
