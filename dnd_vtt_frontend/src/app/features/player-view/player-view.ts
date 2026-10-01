import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../core/services/encounter.service';
import { Encounter, PresentPlayer } from '../../core/models/encounter.model';
import { PortraitSource } from '../../core/models/avatar.model';
import { portraitSource } from '../../core/utils/avatar';
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
        map[p.characterId] = portraitSource(p.portraitSeed || p.characterId, p.avatarRecipe);
      }
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
      this.presenceSub = this.encounterService.watchPresence(encounterId)
        .subscribe(players => this.presentPlayers.set(players));
      this.turnSub = this.encounterService.watchTurnState()
        .subscribe(state => {
          this.currentTurnTokenId.set(state.current_turn_token_id);
          this.currentTurnMapId.set(state.current_turn_map_id ?? null);
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
  }
}
