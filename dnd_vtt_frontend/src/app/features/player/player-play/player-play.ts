import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { CharacterService } from '../../../core/services/character.service';
import { EncounterService } from '../../../core/services/encounter.service';
import { AuthService } from '../../../core/services/auth.service';
import { Character } from '../../../core/models/character.model';
import { Encounter, PresentPlayer } from '../../../core/models/encounter.model';
import { BattleMapComponent } from '../../battle-map/battle-map';
import { CharacterPlaySheetComponent } from '../../dm/dm-play/character-play-sheet/character-play-sheet';

const SESSION_KEY = 'dnd-player-encounter-session';
interface StoredSession { code: string; characterId: string; }

@Component({
  selector: 'app-player-play',
  imports: [FormsModule, MatIconModule, BattleMapComponent, CharacterPlaySheetComponent],
  templateUrl: './player-play.html',
})
export class PlayerPlayComponent implements OnInit, OnDestroy {
  private characterService = inject(CharacterService);
  private encounterService = inject(EncounterService);
  private auth              = inject(AuthService);

  characters = signal<Character[]>([]);
  loading    = signal(true);

  selectedCharacterId = signal<string | null>(null);
  joinCode = '';
  joining    = signal(false);
  joinError  = signal<string | null>(null);

  // Set once a code resolves — swaps the whole view to the map + the player's own character sheet.
  activeEncounter  = signal<Encounter | null>(null);
  activeCharacter  = signal<Character | null>(null);

  // Map and sheet each need the full width to be usable (the sheet's stat columns don't fit a
  // sidebar), so the player toggles between them full-screen rather than viewing both at once.
  view = signal<'map' | 'sheet'>('map');

  // Everyone else (and yourself) currently viewing this encounter — read-only, self-reported HP
  // per player (see EncounterPresenceGateway), fed to the battle-map so party members' tokens can
  // show HP the same way the DM's board does. Monster tokens still only show HP to the DM.
  presentPlayers = signal<PresentPlayer[]>([]);
  private presenceSub?: Subscription;

  characterHp = computed(() => {
    const map: Record<string, { hp: number; max_hp: number }> = {};
    for (const p of this.presentPlayers()) {
      if (p.characterId && p.hp != null && p.max_hp != null) map[p.characterId] = { hp: p.hp, max_hp: p.max_hp };
    }
    return map;
  });

  async ngOnInit() {
    this.characters.set(await this.characterService.getMyCharacters());
    this.loading.set(false);

    // A page refresh mid-session shouldn't drop the player back to the picker — silently retry
    // the last join; if the encounter's since been stopped, joinByCode 404s and we fall back.
    const stored = this.loadStoredSession();
    const character = stored && this.characters().find(c => c.id === stored.characterId);
    if (stored && character) {
      this.selectedCharacterId.set(character.id!);
      this.joinCode = stored.code;
      await this.join(true);
    }
  }

  selectCharacter(id: string) {
    this.selectedCharacterId.set(id);
  }

  async join(silent = false) {
    const characterId = this.selectedCharacterId();
    const character = this.characters().find(c => c.id === characterId);
    if (!character || !this.joinCode.trim()) return;

    this.joining.set(true);
    this.joinError.set(null);
    try {
      const encounter = await this.encounterService.joinByCode(this.joinCode.trim());
      this.activeEncounter.set(encounter);
      this.activeCharacter.set(character);
      this.view.set('map');
      this.saveSession({ code: this.joinCode.trim().toUpperCase(), characterId: character.id! });
      this.announceSelf(encounter.id!, character);
      this.presenceSub = this.encounterService.watchPresence(encounter.id!)
        .subscribe(players => this.presentPlayers.set(players));
    } catch {
      this.clearStoredSession();
      if (!silent) this.joinError.set('No active encounter with that code.');
    } finally {
      this.joining.set(false);
    }
  }

  leaveEncounter() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
    this.presentPlayers.set([]);
    this.activeEncounter.set(null);
    this.activeCharacter.set(null);
    this.clearStoredSession();
  }

  // Best-effort — if the tab closes instead of clicking "Leave", the gateway's disconnect
  // handler is the real safety net that cleans up the DM's roster.
  ngOnDestroy() {
    const encounter = this.activeEncounter();
    if (encounter?.id) this.encounterService.leavePresence(encounter.id);
    this.presenceSub?.unsubscribe();
  }

  onCharacterSaved(character: Character) {
    this.activeCharacter.set(character);
    this.characters.update(list => list.map(c => c.id === character.id ? character : c));
    // Presence only re-broadcasts on (re-)announce/leave — HP just changed, so re-announce to push
    // it out to everyone else watching this encounter's presence.
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

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  private saveSession(s: StoredSession) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  private loadStoredSession(): StoredSession | null {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private clearStoredSession() {
    localStorage.removeItem(SESSION_KEY);
  }
}
