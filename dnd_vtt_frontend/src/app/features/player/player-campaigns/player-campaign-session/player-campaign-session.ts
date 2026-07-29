import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../../../core/services/encounter.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CampaignService } from '../../../../core/services/campaign.service';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Encounter, PresentPlayer } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { BattleMap } from '../../../../core/models/campaign.model';
import { BattleMapComponent } from '../../../battle-map/battle-map';
import { CharacterPlaySheetComponent } from '../../../dm/dm-play/character-play-sheet/character-play-sheet';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';

const REJOIN_KEY = 'dnd-player-campaign-encounter';
interface StoredRejoin { encounterId: string; }

@Component({
  selector: 'app-player-campaign-session',
  imports: [MatIconModule, MatTooltipModule, BattleMapComponent, CharacterPlaySheetComponent, NotesPanelComponent],
  templateUrl: './player-campaign-session.html',
  // Routed in via player-shell's <router-outlet> rather than embedded with an explicit sizing
  // class the way e.g. <app-battle-map class="flex-1 min-w-0"> is — the router inserts this
  // component as a plain sibling of the outlet, so without a host class it stays an unsized
  // inline element and the template's `h-full` has nothing to be 100% of. That left the battle
  // map's container at clientHeight 0, which drove its grid-drawing loop into a tab-hanging
  // infinite loop the moment a player joined an active encounter.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class PlayerCampaignSessionComponent implements OnInit, OnDestroy {
  private route            = inject(ActivatedRoute);
  private router            = inject(Router);
  private encounterService = inject(EncounterService);
  private characterService = inject(CharacterService);
  private campaignService  = inject(CampaignService);
  private mapService       = inject(BattleMapService);
  private auth              = inject(AuthService);

  // Angular reuses this component instance across navigations to the same route config even when
  // :campaignId/:sessionId change (e.g. the live-alert banner in player-shell can send someone
  // straight from one session's page to another) — so these are set reactively from paramMap
  // rather than captured once from the route snapshot, and every load goes through loadSession().
  campaignId!: string;
  sessionId!: string;

  encounters = signal<Encounter[]>([]);
  recapMaps  = signal<Record<string, BattleMap>>({});
  loading    = signal(true);
  joiningId  = signal<string | null>(null);

  // This campaign's DM-editable copy of the player's character — the only character this player
  // ever plays as inside this campaign (see campaign_members.character_id).
  private myCharacterId: string | null = null;

  activeEncounter = signal<Encounter | null>(null);
  activeCharacter = signal<Character | null>(null);
  view = signal<'map' | 'sheet'>('map');
  showLiveNotes = signal(false);

  expandedNotesFor = signal<Set<string>>(new Set());

  presentPlayers = signal<PresentPlayer[]>([]);
  private presenceSub?: Subscription;

  private pendingAutojoinId: string | null = null;

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.hp != null && p.max_hp != null) map[p.characterId] = { hp: p.hp, max_hp: p.max_hp };
    }
    return map;
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.campaignId = params.get('campaignId')!;
      this.sessionId  = params.get('sessionId')!;
      void this.loadSession();
    });
    this.route.queryParamMap.subscribe(params => {
      this.pendingAutojoinId = params.get('autojoin');
      this.maybeAutojoin();
    });
  }

  ngOnDestroy() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
  }

  private async loadSession() {
    this.leaveEncounter();
    this.loading.set(true);
    const [hub, encounters] = await Promise.all([
      this.campaignService.getById(this.campaignId),
      this.encounterService.getBySession(this.sessionId),
    ]);
    const me = hub.members.find(m => m.user_id === this.auth.profile()?.id);
    this.myCharacterId = me?.character_id ?? null;
    this.encounters.set(encounters);
    this.loading.set(false);
    void this.loadRecapMaps(encounters);

    const stored = this.loadStoredRejoin();
    const stillActive = stored && encounters.find(e => e.id === stored.encounterId && e.status === 'active');
    if (stillActive) {
      await this.join(stillActive);
    } else {
      this.maybeAutojoin();
    }
  }

  // Runs after every load and every query-param change — whichever comes last actually finds a
  // matching, still-active encounter to join.
  private maybeAutojoin() {
    if (!this.pendingAutojoinId || this.activeEncounter()) return;
    const target = this.encounters().find(e => e.id === this.pendingAutojoinId && e.status === 'active');
    if (target) {
      this.pendingAutojoinId = null;
      void this.join(target);
    }
  }

  backToHub() {
    void this.router.navigate(['/player/campaigns', this.campaignId]);
  }

  private async loadRecapMaps(encounters: Encounter[]) {
    const withMaps = encounters.filter(e => e.status !== 'active' && e.map_id);
    const maps = await Promise.all(withMaps.map(e => this.mapService.getMap(e.map_id!).catch(() => null)));
    const next: Record<string, BattleMap> = {};
    withMaps.forEach((e, i) => { const m = maps[i]; if (m) next[e.id!] = m; });
    this.recapMaps.set(next);
  }

  async join(encounter: Encounter) {
    const characterId = this.myCharacterId;
    if (!characterId || !encounter.join_code) return;
    this.joiningId.set(encounter.id!);
    try {
      const character = await this.characterService.getCharacter(characterId);
      const joined = await this.encounterService.joinByCode(encounter.join_code);
      this.activeEncounter.set(joined);
      this.activeCharacter.set(character);
      this.view.set('map');
      this.saveStoredRejoin({ encounterId: joined.id! });
      this.announceSelf(joined.id!, character);
      this.presenceSub = this.encounterService.watchPresence(joined.id!)
        .subscribe(players => this.presentPlayers.set(players));
    } catch {
      this.clearStoredRejoin();
    } finally {
      this.joiningId.set(null);
    }
  }

  leaveEncounter() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
    this.presentPlayers.set([]);
    this.activeEncounter.set(null);
    this.activeCharacter.set(null);
    this.clearStoredRejoin();
  }

  onCharacterSaved(character: Character) {
    this.activeCharacter.set(character);
    const encounter = this.activeEncounter();
    if (encounter?.id) this.announceSelf(encounter.id, character);
  }

  private announceSelf(encounterId: string, character: Character) {
    this.encounterService.announcePresence(encounterId, {
      username: this.auth.profile()?.username ?? 'Player',
      characterId: character.id!,
      characterName: character.name,
      hp: character.current_hp,
      max_hp: character.max_hp,
    });
  }

  mapFor(encounter: Encounter): BattleMap | undefined {
    return encounter.id ? this.recapMaps()[encounter.id] : undefined;
  }

  notesExpanded(encounterId: string): boolean {
    return this.expandedNotesFor().has(encounterId);
  }

  toggleNotes(encounterId: string) {
    this.expandedNotesFor.update(set => {
      const next = new Set(set);
      next.has(encounterId) ? next.delete(encounterId) : next.add(encounterId);
      return next;
    });
  }

  private saveStoredRejoin(s: StoredRejoin) {
    sessionStorage.setItem(REJOIN_KEY, JSON.stringify(s));
  }

  private loadStoredRejoin(): StoredRejoin | null {
    try {
      return JSON.parse(sessionStorage.getItem(REJOIN_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private clearStoredRejoin() {
    sessionStorage.removeItem(REJOIN_KEY);
  }
}
