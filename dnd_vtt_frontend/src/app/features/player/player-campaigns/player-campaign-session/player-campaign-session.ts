import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../../../core/services/encounter.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CampaignService } from '../../../../core/services/campaign.service';
import { SessionService } from '../../../../core/services/session.service';
import { ContentService } from '../../../../core/services/content.service';
import { AuthService } from '../../../../core/services/auth.service';
import { BackgroundService } from '../../../../core/services/background.service';
import { Encounter, MyEncounterLevel, PresentPlayer } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { PortraitSource } from '../../../../core/models/avatar.model';
import { portraitSource } from '../../../../core/utils/avatar';
import { CampaignMember, MapToken } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { BattleMapComponent } from '../../../battle-map/battle-map';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { CharacterWizardComponent } from '../../../characters/character-wizard/character-wizard';
import { PartyListComponent } from '../../../../shared/components/party-list/party-list';
import { WikiEmbedComponent } from '../../../wiki/wiki-embed.component';
import { HubViewService } from '../../../../core/services/hub-view.service';
import { ResizeHandleDirective } from '../../../../shared/directives/resize-handle.directive';

const REJOIN_KEY = 'dnd-player-campaign-encounter';
interface StoredRejoin { encounterId: string; }

// Character.race stores the race's display name (e.g. "Half-Elf"), not its content index (e.g.
// "half-elf") — same conversion dm-campaign-session.ts/dm-campaign-hub.ts/character-play-sheet.ts
// each do before calling ContentService.getRace(), which looks the race up by a case-sensitive
// filename and 404s on a raw display name.
function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-player-campaign-session',
  imports: [
    MatIconModule, MatTooltipModule, BattleMapComponent, CharacterPlaySheetComponent, CharacterWizardComponent,
    PartyListComponent, WikiEmbedComponent, ResizeHandleDirective,
  ],
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
  private sessionService   = inject(SessionService);
  private contentService   = inject(ContentService);
  private background       = inject(BackgroundService);
  auth                     = inject(AuthService);
  hubView                  = inject(HubViewService);

  // Angular reuses this component instance across navigations to the same route config even when
  // :campaignId/:sessionId change (e.g. the live-alert banner in player-shell can send someone
  // straight from one session's page to another) — so these are set reactively from paramMap
  // rather than captured once from the route snapshot, and every load goes through loadSession().
  campaignId!: string;
  sessionId!: string;

  session      = signal<Session | null>(null);
  campaignName = signal<string | null>(null);
  encounters = signal<Encounter[]>([]);

  // The embedded wiki panel prefers a page named after this session, then one named after the campaign.
  readonly wikiTitles = computed(() =>
    [this.session()?.name, this.campaignName()].filter((n): n is string => !!n),
  );
  members    = signal<CampaignMember[]>([]);
  loading    = signal(true);
  joiningId  = signal<string | null>(null);

  // This campaign's DM-editable copy of the player's character — the only character this player
  // ever plays as inside this campaign (see campaign_members.character_id).
  myCharacterId = signal<string | null>(null);
  // Loaded copy of that character, shown inline in the main column when the Wiki/Character tabs
  // next to the title are set to Character (see HubViewService).
  myCharacter = signal<Character | null>(null);
  readonly showSheet = computed(() => this.hubView.current() === 'sheet' && !!this.myCharacterId());

  // Self-service "view/edit my character" flow off the Party list, shown while no encounter is
  // active — kept in lockstep with PlayerCampaignHubComponent's identical fields/methods so the
  // Party list behaves the same whether opened from the campaign hub or the session hub.
  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter   = signal<Character | null>(null);
  // Set only when the sheet was opened via the wizard's "View Sheet" button (as opposed to
  // viewMyCharacter) — routes closeCharacterSheet() back into the wizard instead of the session hub.
  sheetFromWizard  = signal(false);

  activeEncounter = signal<Encounter | null>(null);
  activeCharacter = signal<Character | null>(null);
  // Darkvision is personal, not a shared light — this is only ever fed to *this* browser's own
  // battle-map instance (see BattleMapComponent.myDarkvisionFt), never broadcast, so another
  // player never sees through it. null = no darkvision (race grants none and no DM override).
  myDarkvisionFt = signal<number | null>(null);
  view = signal<'map' | 'sheet'>('map');

  presentPlayers = signal<PresentPlayer[]>([]);
  private presenceSub?: Subscription;

  // Resolved from the battle-map's own token list via (currentTurnTokenChanged) — pushed live by
  // the DM stepping turns, see watchTurnState() below.
  currentTurnToken = signal<MapToken | null>(null);
  private turnSub?: Subscription;

  // Every level's (player-visible) tokens, so the turn order isn't limited to this player's level.
  turnOrderTokens = signal<MapToken[] | null>(null);
  private turnOrderSub?: Subscription;

  // Which level of a (possibly multi-level) encounter this player sees — the one their own
  // character's token is on. Re-resolved whenever the DM places, moves, or removes that token.
  myLevel = signal<MyEncounterLevel | null>(null);
  private levelSub?: Subscription;
  private levelRequest = 0;

  private pendingAutojoinId: string | null = null;

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.hp != null && p.max_hp != null) map[p.characterId] = { hp: p.hp, max_hp: p.max_hp };
    }
    return map;
  });

  // Same idea as characterHp above — self-reported presence data, not a fetched Character, so a
  // present player's token can show their portrait without the DM's Character-fetch machinery.
  characterPortraits = computed(() => {
    const map: Record<string, PortraitSource> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId) {
        map[p.characterId] = portraitSource(p.portraitSeed || p.characterId, p.avatarRecipe);
      }
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
      // On a fresh navigation loadSession() runs maybeAutojoin() itself once its data lands, so
      // only act here when we're NOT loading — that's the case where the session page was already
      // open (clicking the shell's "went live" banner for the very session you're viewing doesn't
      // change the route params, so paramMap never re-fires and loadSession never re-runs).
      if (this.pendingAutojoinId && !this.loading()) void this.maybeAutojoin();
    });
  }

  ngOnDestroy() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
    this.turnSub?.unsubscribe();
    this.turnOrderSub?.unsubscribe();
    this.levelSub?.unsubscribe();
  }

  private async loadSession() {
    this.resetEncounterState();
    this.loading.set(true);
    const [hub, encounters, session] = await Promise.all([
      this.campaignService.getById(this.campaignId),
      this.encounterService.getBySession(this.sessionId),
      this.sessionService.getById(this.sessionId),
    ]);
    const me = hub.members.find(m => m.user_id === this.auth.profile()?.id);
    this.myCharacterId.set(me?.character_id ?? null);
    this.session.set(session);
    this.campaignName.set(hub.name);
    this.encounters.set(encounters);
    this.members.set(hub.members);
    this.loading.set(false);
    void this.loadMyCharacter();

    const stored = this.loadStoredRejoin();
    const stillActive = stored && encounters.find(e => e.id === stored.encounterId && e.status === 'active');
    if (stillActive) {
      await this.join(stillActive);
    } else {
      void this.maybeAutojoin();
    }
  }

  // Joins the encounter named by ?autojoin= (set by the shell's "went live" banner). Called both
  // at the end of loadSession() and straight off the query-param change. The local encounter list
  // can be stale — the player may have been sitting on this session page when the DM hit Start, so
  // it still shows the encounter as 'draft' — so if the target isn't present as active, refetch
  // once before giving up.
  private async maybeAutojoin() {
    if (!this.pendingAutojoinId || this.activeEncounter() || this.joiningId()) return;
    const isTarget = (e: Encounter) => e.id === this.pendingAutojoinId && e.status === 'active';
    let target = this.encounters().find(isTarget);
    if (!target) {
      try {
        const fresh = await this.encounterService.getBySession(this.sessionId);
        this.encounters.set(fresh);
        target = fresh.find(isTarget);
      } catch {
        return;
      }
      if (this.activeEncounter() || this.joiningId()) return; // a parallel call already took it
    }
    if (target) {
      this.pendingAutojoinId = null;
      void this.join(target);
    }
  }

  // The drag handle sits left of the sidebar, so dragging left (negative dx) widens it.
  onSidebarResize(dx: number) {
    this.hubView.setSidebarWidth(this.hubView.sidebarWidth() - dx);
  }

  private async loadMyCharacter() {
    const id = this.myCharacterId();
    this.myCharacter.set(id ? await this.characterService.getCharacter(id) : null);
  }

  // The inline sheet's (saved) — same Party-roster refresh as onCharacterSheetSaved, without
  // opening the full-page sheet.
  async onMyCharacterSaved(character: Character) {
    this.myCharacter.set(character);
    const hub = await this.campaignService.getById(this.campaignId);
    this.members.set(hub.members);
  }

  backToHub() {
    void this.router.navigate(['/home/campaigns', this.campaignId]);
  }

  // The DM grants this per member (see DmCampaignHubComponent.toggleEditAccess) — otherwise a
  // player's campaign copy only accepts the play sheet's limited HP/rest/equipment writes.
  // Mirrors PlayerCampaignHubComponent.editMyCharacter.
  async editMyCharacter(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  // Player's own choice, hidden from the rest of the party by default (see CampaignsService V14
  // migration / setOwnRaceClassVisibility) — the DM always sees it regardless of this toggle.
  // Mirrors PlayerCampaignHubComponent.toggleRaceClassVisibility.
  async toggleRaceClassVisibility(member: CampaignMember) {
    const hub = await this.campaignService.setOwnRaceClassVisibility(this.campaignId, !member.show_race_class);
    this.members.set(hub.members);
  }

  async onWizardSaved() {
    this.showWizard.set(false);
    const hub = await this.campaignService.getById(this.campaignId);
    this.members.set(hub.members);
    void this.loadMyCharacter();
  }

  onWizardCancelled() {
    this.showWizard.set(false);
  }

  async onViewCharacterSheet(id: string) {
    this.showWizard.set(false);
    this.sheetFromWizard.set(true);
    this.sheetCharacter.set(await this.characterService.getCharacter(id));
  }

  async viewMyCharacter(member: CampaignMember) {
    this.sheetFromWizard.set(false);
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  levelUpMyCharacter(member: CampaignMember) {
    void this.router.navigate(['/home/characters', member.character_id, 'level-up']);
  }

  // The play sheet's (saved) emits the updated character after every persist — keep the sheet in
  // sync and refresh the Party roster's HP/AC badges to match, but stay on the sheet (unlike the
  // wizard's onWizardSaved, which navigates back to the session hub).
  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    if (character.id === this.myCharacterId()) this.myCharacter.set(character);
    const hub = await this.campaignService.getById(this.campaignId);
    this.members.set(hub.members);
  }

  closeCharacterSheet() {
    if (this.sheetFromWizard()) {
      // sheetCharacter is already the latest saved copy (kept current by onCharacterSheetSaved),
      // so reuse it as the wizard's starting point instead of re-fetching.
      this.editingCharacter.set(this.sheetCharacter());
      this.sheetFromWizard.set(false);
      this.sheetCharacter.set(null);
      this.showWizard.set(true);
      return;
    }
    this.sheetCharacter.set(null);
  }

  async join(encounter: Encounter) {
    const characterId = this.myCharacterId();
    if (!characterId) return;
    this.joiningId.set(encounter.id!);
    try {
      // Resolved before the map shows, so a player already on a lower level doesn't flash the
      // entry level first.
      const [character, level] = await Promise.all([
        this.characterService.getCharacter(characterId),
        this.encounterService.getMyLevel(encounter.id!),
      ]);
      this.myLevel.set(level);
      this.activeEncounter.set(encounter);
      // The app-wide background picked in Settings would otherwise show through around/behind
      // the battle map — fully opaque it while an encounter's up; resetEncounterState() below
      // reverts to the session hub's normal overlay the moment the player leaves the map view.
      this.background.setPageOverlay(1);
      this.activeCharacter.set(character);
      void this.refreshDarkvision(character);
      this.view.set('map');
      this.saveStoredRejoin({ encounterId: encounter.id! });
      this.announceSelf(encounter.id!, character);
      this.presenceSub = this.encounterService.watchPresence(encounter.id!)
        .subscribe(players => this.presentPlayers.set(players));
      this.turnSub = this.encounterService.watchTurnState()
        .subscribe(state => {
          this.activeEncounter.update(e => e ? {
            ...e, current_turn_token_id: state.current_turn_token_id, round_number: state.round_number,
          } : e);
          // Safety net for a level switch whose broadcast was missed (e.g. a dropped connection).
          void this.refreshMyLevel(encounter.id!);
        });
      this.turnOrderSub = this.encounterService.watchTurnOrder(encounter.id!)
        .subscribe(tokens => this.turnOrderTokens.set(tokens));
      this.levelSub = this.encounterService.watchCharacterLevelChanged()
        .subscribe(event => {
          if (event.characterId === this.myCharacterId()) void this.refreshMyLevel(encounter.id!);
        });
    } catch {
      this.clearStoredRejoin();
    } finally {
      this.joiningId.set(null);
    }
  }

  // Guarded by a request counter so a slow response can't overwrite a newer one when the DM
  // moves the token twice in quick succession.
  private async refreshMyLevel(encounterId: string) {
    const request = ++this.levelRequest;
    try {
      const level = await this.encounterService.getMyLevel(encounterId);
      if (request === this.levelRequest && this.activeEncounter()?.id === encounterId) this.myLevel.set(level);
    } catch {
      // Keep showing the current level; the next token change retries.
    }
  }

  // Explicit "Leave" action — also forgets the rejoin target so a later refresh doesn't pull the
  // player back in.
  leaveEncounter() {
    this.resetEncounterState();
    this.clearStoredRejoin();
  }

  // Tears down local/live state without touching the stored rejoin target — used at the top of
  // loadSession(), which needs to read that target right after to decide whether to auto-rejoin.
  private resetEncounterState() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
    this.turnSub?.unsubscribe();
    this.turnOrderSub?.unsubscribe();
    this.levelSub?.unsubscribe();
    this.turnOrderTokens.set(null);
    this.myLevel.set(null);
    this.presentPlayers.set([]);
    this.currentTurnToken.set(null);
    this.activeEncounter.set(null);
    this.activeCharacter.set(null);
    this.myDarkvisionFt.set(null);
    this.background.resetPageOverlay();
  }

  onCharacterSaved(character: Character) {
    this.activeCharacter.set(character);
    this.myCharacter.set(character);
    void this.refreshDarkvision(character);
    const encounter = this.activeEncounter();
    if (encounter?.id) this.announceSelf(encounter.id, character);
  }

  // An explicit character.darkvision_ft (including 0, a DM override removing it) always wins;
  // otherwise it's whatever the character's race grants, looked up live rather than flattened
  // onto the character at creation — so a DM's later override always takes effect immediately
  // without needing the player to re-save their character.
  private async refreshDarkvision(character: Character) {
    if (character.darkvision_ft != null) {
      this.myDarkvisionFt.set(character.darkvision_ft);
      return;
    }
    try {
      const race = await this.contentService.getRace(toContentIndex(character.race));
      this.myDarkvisionFt.set(race.darkvision_ft ?? null);
    } catch {
      this.myDarkvisionFt.set(null);
    }
  }

  private announceSelf(encounterId: string, character: Character) {
    this.encounterService.announcePresence(encounterId, {
      username: this.auth.profile()?.username ?? 'Player',
      characterId: character.id!,
      characterName: character.name,
      hp: character.current_hp,
      max_hp: character.max_hp,
      portraitSeed: character.portrait_seed,
      avatarRecipe: character.avatar_recipe,
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
