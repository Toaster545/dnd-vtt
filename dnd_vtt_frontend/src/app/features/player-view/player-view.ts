import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../core/services/encounter.service';
import { Encounter, PresentPlayer } from '../../core/models/encounter.model';
import { MapToken } from '../../core/models/campaign.model';
import { PortraitSource } from '../../core/models/avatar.model';
import { portraitSource } from '../../core/utils/avatar';
import { TokenBorder } from '../../core/models/token-border.model';
import { normalizeTokenBorder } from '../../core/utils/token-border';
import { BattleMapComponent } from '../battle-map/battle-map';

// A read-only, chrome-free window showing exactly what players see on the battle map — meant to be
// popped out (window.open, see EncounterToolbarComponent) onto a second monitor for the table.
// Deliberately mirrors PlayerCampaignSessionComponent's map wiring (canControl=false, HP/portraits
// sourced from self-reported presence rather than fetched Character records) rather than
// DmEncounterPlayComponent's, since the whole point is parity with the player view, not the DM one.
@Component({
  selector: 'app-player-view',
  imports: [BattleMapComponent],
  templateUrl: './player-view.html',
  host: { class: 'block h-screen w-screen bg-black overflow-hidden' },
})
export class PlayerViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private encounterService = inject(EncounterService);

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
  presentPlayers = signal<PresentPlayer[]>([]);

  private presenceSub?: Subscription;
  private turnSub?: Subscription;
  private turnOrderSub?: Subscription;
  // Every level's tokens, so the table's turn order covers the whole encounter.
  turnOrderTokens = signal<MapToken[] | null>(null);

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.hp != null && p.max_hp != null) map[p.characterId] = { hp: p.hp, max_hp: p.max_hp };
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
    return map;
  });

  characterTokenBorders = computed(() => {
    const map: Record<string, TokenBorder> = {};
    for (const p of this.presentPlayers()) {
      const border = normalizeTokenBorder(p.tokenBorder);
      if (p.characterId && border) map[p.characterId] = border;
    }
    return map;
  });

  async ngOnInit() {
    const encounterId = this.route.snapshot.paramMap.get('encounterId')!;
    try {
      const encounter = await this.encounterService.getById(encounterId);
      this.encounter.set(encounter);
      this.currentTurnTokenId.set(encounter.current_turn_token_id ?? null);
      this.currentTurnMapId.set(encounter.current_turn_map_id ?? null);
      this.roundNumber.set(encounter.round_number ?? 1);
      this.presenceSub = this.encounterService.watchPresence(encounterId)
        .subscribe(players => this.presentPlayers.set(players));
      this.turnOrderSub = this.encounterService.watchTurnOrder(encounterId)
        .subscribe(tokens => this.turnOrderTokens.set(tokens));
      this.turnSub = this.encounterService.watchTurnState()
        .subscribe(state => {
          this.currentTurnTokenId.set(state.current_turn_token_id);
          this.currentTurnMapId.set(state.current_turn_map_id ?? null);
          this.roundNumber.set(state.round_number);
        });
    } catch {
      this.error.set('Could not load this encounter.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.presenceSub?.unsubscribe();
    this.turnSub?.unsubscribe();
    this.turnOrderSub?.unsubscribe();
  }
}
