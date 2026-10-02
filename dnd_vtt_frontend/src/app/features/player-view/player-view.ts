import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../core/services/encounter.service';
import { CharacterService } from '../../core/services/character.service';
import { ContentService } from '../../core/services/content.service';
import { Encounter, PresentPlayer } from '../../core/models/encounter.model';
import { Character } from '../../core/models/character.model';
import { MapToken } from '../../core/models/campaign.model';
import { PortraitSource } from '../../core/models/avatar.model';
import { portraitSource } from '../../core/utils/avatar';
import { TokenBorder } from '../../core/models/token-border.model';
import { normalizeTokenBorder } from '../../core/utils/token-border';
import { tokensAsPlayersSee } from '../../core/utils/player-perspective';
import { BattleMapComponent } from '../battle-map/battle-map';

// Character.race stores the race's display name ("Half-Elf"), not its content index ("half-elf")
// — same conversion player-campaign-session.ts does before ContentService.getRace().
function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// A read-only, chrome-free window showing what the players see on the battle map — meant to be
// popped out (window.open, see DmEncounterPlayComponent.openPlayerView) onto a second monitor for
// the table. It's opened from the DM's screen, so it runs signed in as the DM: the server sends
// it the DM's full data, and everything players mustn't see is trimmed here instead (viewAsPlayers
// on the map, tokensAsPlayersSee for the turn order). Being one screen for the whole party, it
// shows every party member's portrait, HP and border (not just connected players') and lights the
// darkness with the whole party's darkvision.
@Component({
  selector: 'app-player-view',
  imports: [BattleMapComponent],
  templateUrl: './player-view.html',
  host: { class: 'block h-screen w-screen bg-black overflow-hidden' },
})
export class PlayerViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private encounterService = inject(EncounterService);
  private characterService = inject(CharacterService);
  private contentService = inject(ContentService);

  encounter = signal<Encounter | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  currentTurnTokenId = signal<string | null>(null);
  // The turn order stays hidden from the table until round 2.
  roundNumber = signal(1);
  // A multi-level encounter has no single "what players see" — the table screen follows combat
  // instead, showing whichever level the current-turn token is on (the entry level until turns start).
  private currentTurnMapId = signal<string | null>(null);
  levelMapId = computed(() => {
    const encounter = this.encounter();
    const turnMap = this.currentTurnMapId();
    const isLevel = !!turnMap && !!encounter?.levels?.some(l => l.map_id === turnMap);
    return isLevel ? turnMap : encounter?.map_id ?? null;
  });
  // Shown only when there's more than one level to tell apart.
  levelName = computed(() => {
    const levels = this.encounter()?.levels ?? [];
    if (levels.length < 2) return null;
    return levels.find(l => l.map_id === this.levelMapId())?.name ?? null;
  });
  presentPlayers = signal<PresentPlayer[]>([]);

  private presenceSub?: Subscription;
  private turnSub?: Subscription;
  private turnOrderSub?: Subscription;
  private characterUpdatedSub?: Subscription;
  // Every level's tokens as players see them, so the table's turn order covers the whole encounter
  // without listing hidden monsters.
  turnOrderTokens = signal<MapToken[] | null>(null);
  // Whose turn it is, by the name players see — null while it's a hidden token's turn.
  currentTurnLabel = computed(() => {
    const id = this.currentTurnTokenId();
    return (id && this.turnOrderTokens()?.find(t => t.id === id)?.label) || null;
  });

  // Every character with a token anywhere in the encounter, fetched with the DM's access so an
  // absent player's token still shows their portrait, HP and border.
  private characters = signal<Record<string, Character>>({});
  private darkvisionFt = signal<Record<string, number>>({});
  private raceDarkvision = new Map<string, Promise<number | null>>();

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.hp != null && p.max_hp != null) map[p.characterId] = { hp: p.hp, max_hp: p.max_hp };
    }
    for (const c of Object.values(this.characters())) {
      if (c.id) map[c.id] = { hp: c.current_hp, max_hp: c.max_hp };
    }
    return map;
  });

  characterPortraits = computed(() => {
    const map: Record<string, PortraitSource> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId) {
        map[p.characterId] = portraitSource(p.portraitSeed || p.characterId, p.avatarRecipe, p.portraitImage);
      }
    }
    for (const c of Object.values(this.characters())) {
      if (c.id) map[c.id] = portraitSource(c.portrait_seed || c.id, c.avatar_recipe, c.portrait_image);
    }
    return map;
  });

  characterTokenBorders = computed(() => {
    const map: Record<string, TokenBorder> = {};
    for (const p of this.presentPlayers()) {
      const border = normalizeTokenBorder(p.tokenBorder);
      if (p.characterId && border) map[p.characterId] = border;
    }
    for (const c of Object.values(this.characters())) {
      const border = normalizeTokenBorder(c.token_border);
      if (c.id && border) map[c.id] = border;
      else if (c.id) delete map[c.id];
    }
    return map;
  });

  readonly partyDarkvisionFt = this.darkvisionFt.asReadonly();

  async ngOnInit() {
    const encounterId = this.route.snapshot.paramMap.get('encounterId')!;
    try {
      const encounter = await this.encounterService.getById(encounterId);
      this.encounter.set(encounter);
      this.currentTurnTokenId.set(encounter.current_turn_token_id ?? null);
      this.currentTurnMapId.set(encounter.current_turn_map_id ?? null);
      this.roundNumber.set(encounter.round_number ?? 1);
      this.presenceSub = this.encounterService.watchPresence(encounterId).subscribe(players => {
        this.presentPlayers.set(players);
        void this.loadCharacters(players.map(p => p.characterId));
      });
      this.turnOrderSub = this.encounterService.watchTurnOrder(encounterId).subscribe(tokens => {
        const visible = tokensAsPlayersSee(tokens);
        this.turnOrderTokens.set(visible);
        void this.loadCharacters(visible.map(t => t.character_id ?? ''));
        // The token list is pushed whenever the encounter's levels change too (added, removed,
        // renamed), so re-read them alongside it.
        void this.refreshEncounter(encounterId);
      });
      this.turnSub = this.encounterService.watchTurnState().subscribe(state => {
        this.currentTurnTokenId.set(state.current_turn_token_id);
        this.currentTurnMapId.set(state.current_turn_map_id ?? null);
        this.roundNumber.set(state.round_number);
      });
      this.characterUpdatedSub = this.encounterService.watchCharacterUpdated().subscribe(event => {
        if (!this.characters()[event.characterId]) return;
        this.characterService.getCharacter(event.characterId).then(
          character => this.setCharacter(character),
          () => {
            // Keep the last-known copy; the next character_updated push retries the fetch.
          },
        );
      });
    } catch {
      this.error.set('Could not load this encounter.');
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshEncounter(encounterId: string) {
    try {
      this.encounter.set(await this.encounterService.getById(encounterId));
    } catch {
      // Keep showing the last-known encounter; the next push retries.
    }
  }

  private async loadCharacters(characterIds: string[]) {
    const ids = [...new Set(characterIds.filter(Boolean))].filter(id => !this.characters()[id]);
    if (!ids.length) return;
    const fetched = await Promise.all(ids.map(id => this.characterService.getCharacter(id).catch(() => null)));
    for (const character of fetched) if (character) this.setCharacter(character);
  }

  private setCharacter(character: Character) {
    if (!character.id) return;
    this.characters.update(map => ({ ...map, [character.id!]: character }));
    void this.refreshDarkvision(character);
  }

  // Same rule as a player's own screen: an explicit darkvision_ft (including a DM's 0) wins,
  // otherwise whatever the character's race grants.
  private async refreshDarkvision(character: Character) {
    const ft = character.darkvision_ft != null
      ? character.darkvision_ft
      : await this.raceDarkvisionFt(character.race);
    this.darkvisionFt.update(map => {
      const next = { ...map };
      if (ft) next[character.id!] = ft;
      else delete next[character.id!];
      return next;
    });
  }

  private raceDarkvisionFt(race: string): Promise<number | null> {
    if (!race) return Promise.resolve(null);
    const index = toContentIndex(race);
    let lookup = this.raceDarkvision.get(index);
    if (!lookup) {
      lookup = this.contentService.getRace(index).then(r => r.darkvision_ft ?? null, () => null);
      this.raceDarkvision.set(index, lookup);
    }
    return lookup;
  }

  ngOnDestroy() {
    this.presenceSub?.unsubscribe();
    this.turnSub?.unsubscribe();
    this.turnOrderSub?.unsubscribe();
    this.characterUpdatedSub?.unsubscribe();
  }
}
