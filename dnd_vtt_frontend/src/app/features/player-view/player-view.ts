import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { EncounterService } from '../../core/services/encounter.service';
import { Encounter, PresentPlayer } from '../../core/models/encounter.model';
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
    const map: Record<string, string> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.portraitSeed) map[p.characterId] = p.portraitSeed;
    }
    return map;
  });

  async ngOnInit() {
    const encounterId = this.route.snapshot.paramMap.get('encounterId')!;
    try {
      const encounter = await this.encounterService.getById(encounterId);
      this.encounter.set(encounter);
      this.currentTurnTokenId.set(encounter.current_turn_token_id ?? null);
      this.presenceSub = this.encounterService.watchPresence(encounterId)
        .subscribe(players => this.presentPlayers.set(players));
      this.turnSub = this.encounterService.watchTurnState()
        .subscribe(state => this.currentTurnTokenId.set(state.current_turn_token_id));
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
