import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Encounter, EncounterStartedEvent, MyEncounterLevel, PartyLeveledEvent, PresentPlayer, TurnState,
} from '../models/encounter.model';
import { AvatarRecipeV1 } from '../models/avatar.model';
import { MapToken } from '../models/campaign.model';
import { SocketService } from './socket.service';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class EncounterService {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  // The single player-side presence announcement currently in effect (see announcePresence), so a
  // dropped/reconnected socket can re-announce itself into `encounter-presence:${encounterId}`
  // without the caller having to know or care that a reconnect happened.
  private activeAnnounce: { encounterId: string; reannounce: () => void } | null = null;

  getAll(): Promise<Encounter[]> {
    return firstValueFrom(this.http.get<Encounter[]>(`${API}/encounters`));
  }

  getBySession(sessionId: string): Promise<Encounter[]> {
    return firstValueFrom(this.http.get<Encounter[]>(`${API}/encounters`, { params: { sessionId } }));
  }

  getById(id: string): Promise<Encounter> {
    return firstValueFrom(this.http.get<Encounter>(`${API}/encounters/${id}`));
  }

  // The encounter (if any) currently `active` anywhere in the campaign — a campaign only ever has
  // one, enforced server-side by start(). Used by the session hub to grey out "Start" on every
  // other encounter before the DM even tries.
  getActiveForCampaign(campaignId: string): Promise<Encounter | null> {
    return firstValueFrom(
      this.http.get<Encounter | null>(`${API}/encounters`, { params: { activeCampaignId: campaignId } }),
    );
  }

  // Player side: the level of a multi-level encounter this player's character is currently on.
  getMyLevel(id: string): Promise<MyEncounterLevel> {
    return firstValueFrom(this.http.get<MyEncounterLevel>(`${API}/encounters/${id}/my-level`));
  }

  // DM side: show a character's player a different level — they need a token on it already.
  setPlayerLevel(id: string, characterId: string, mapId: string): Promise<Encounter> {
    return firstValueFrom(
      this.http.put<Encounter>(`${API}/encounters/${id}/player-levels/${characterId}`, { map_id: mapId }),
    );
  }

  create(encounter: Partial<Encounter>): Promise<Encounter> {
    return firstValueFrom(this.http.post<Encounter>(`${API}/encounters`, encounter));
  }

  update(id: string, encounter: Partial<Encounter>): Promise<Encounter> {
    return firstValueFrom(this.http.put<Encounter>(`${API}/encounters/${id}`, encounter));
  }

  setVisibility(id: string, visible: boolean): Promise<Encounter> {
    return firstValueFrom(this.http.patch<Encounter>(`${API}/encounters/${id}/visibility`, { visible }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/encounters/${id}`));
  }

  start(id: string): Promise<Encounter> {
    return firstValueFrom(this.http.post<Encounter>(`${API}/encounters/${id}/start`, {}));
  }

  stop(id: string): Promise<Encounter> {
    return firstValueFrom(this.http.post<Encounter>(`${API}/encounters/${id}/stop`, {}));
  }

  nextTurn(id: string): Promise<Encounter> {
    return firstValueFrom(this.http.post<Encounter>(`${API}/encounters/${id}/turn/next`, {}));
  }

  previousTurn(id: string): Promise<Encounter> {
    return firstValueFrom(this.http.post<Encounter>(`${API}/encounters/${id}/turn/previous`, {}));
  }

  // DM side: live list of players currently viewing this encounter, for the roster's "Players"
  // section — same connect/emit/listen/cleanup shape as BattleMapService.watchTokens.
  watchPresence(encounterId: string): Observable<PresentPlayer[]> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      // Named so `off` below only removes this subscription's own listener — `socket` is a
      // singleton shared with other live features (e.g. map token watching), so tearing down one
      // subscriber must never disconnect it or drop another subscriber's listeners wholesale.
      const handleUpdate = (players: PresentPlayer[]) => observer.next(players);
      // Re-joins on every (re)connect, not just the first — see BattleMapService.joinMapRoom for
      // why: socket.io drops server-side room membership across a reconnected transport, so
      // without this, a network blip silently stops delivering further presence updates.
      const rejoin = () => socket.emit('watch_encounter_presence', encounterId);
      socket.on('connect', rejoin);
      this.socketService.connect();
      if (socket.connected) rejoin();
      socket.on('encounter_players_updated', handleUpdate);

      return () => {
        socket.off('connect', rejoin);
        socket.off('encounter_players_updated', handleUpdate);
      };
    });
  }

  // Player side: announce (or stop announcing) that this browser is viewing the encounter as a
  // given character — the DM's watchPresence() picks up the broadcast. Re-announces itself on
  // every reconnect (see activeAnnounce) since this, like watchPresence's join, doesn't survive a
  // dropped/reconnected transport on its own — without it, a player who loses their connection
  // mid-session silently stops receiving turn_changed pushes (same room) until they hard-refresh.
  announcePresence(encounterId: string, info: {
    username: string; characterId: string; characterName: string; hp?: number; max_hp?: number;
    portraitSeed?: string;
    avatarRecipe?: AvatarRecipeV1;
  }) {
    const socket = this.socketService.socket;
    if (this.activeAnnounce) socket.off('connect', this.activeAnnounce.reannounce);
    const reannounce = () => socket.emit('announce_presence', { encounterId, ...info });
    this.activeAnnounce = { encounterId, reannounce };
    socket.on('connect', reannounce);
    this.socketService.connect();
    if (socket.connected) reannounce();
  }

  leavePresence(encounterId: string) {
    const socket = this.socketService.socket;
    if (this.activeAnnounce?.encounterId === encounterId) {
      socket.off('connect', this.activeAnnounce.reannounce);
      this.activeAnnounce = null;
    }
    socket.emit('leave_presence', encounterId);
  }

  // Live turn-state push (current token + round) after the DM steps the turn forward/back. Relies
  // on the caller already being in the `encounter-presence:${id}` room via watchPresence()
  // (DM side) or announcePresence() (player side) — this doesn't do its own join/emit.
  watchTurnState(): Observable<TurnState> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleUpdate = (state: TurnState) => observer.next(state);
      this.socketService.connect();
      socket.on('turn_changed', handleUpdate);

      return () => {
        socket.off('turn_changed', handleUpdate);
      };
    });
  }

  // Every token across all of the encounter's levels, highest initiative first — already filtered
  // server-side to what a player may see.
  getTurnOrder(id: string): Promise<MapToken[]> {
    return firstValueFrom(this.http.get<MapToken[]>(`${API}/encounters/${id}/turn-order`));
  }

  // getTurnOrder, refetched whenever a token changes on any level (or the level list itself
  // changes) and after a reconnect. Same room caveat as watchTurnState.
  watchTurnOrder(encounterId: string): Observable<MapToken[]> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const refetch = () => {
        this.getTurnOrder(encounterId).then(tokens => observer.next(tokens), () => {});
      };
      const handleChange = (event: { encounterId: string }) => {
        if (event.encounterId === encounterId) refetch();
      };
      this.socketService.connect();
      socket.on('encounter_tokens_changed', handleChange);
      socket.on('connect', refetch);
      refetch();

      return () => {
        socket.off('encounter_tokens_changed', handleChange);
        socket.off('connect', refetch);
      };
    });
  }

  // Fires when a character's token is placed on, moved between, or removed from a map in one of
  // the caller's campaigns — the player owning that character re-resolves which level they're on
  // (see PlayerCampaignSessionComponent). Campaign-room scoped, so the caller filters by character.
  watchCharacterLevelChanged(): Observable<{ campaignId: string; characterId: string }> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleChange = (event: { campaignId: string; characterId: string }) => observer.next(event);
      this.socketService.connect();
      socket.on('character_level_changed', handleChange);

      return () => {
        socket.off('character_level_changed', handleChange);
      };
    });
  }

  // Fires whenever any encounter goes live, regardless of campaign — the caller is responsible
  // for filtering to campaigns it actually cares about (see ShellComponent).
  watchEncounterStarted(): Observable<EncounterStartedEvent> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleStart = (event: EncounterStartedEvent) => observer.next(event);
      this.socketService.connect();
      socket.on('encounter_started', handleStart);

      return () => {
        socket.off('encounter_started', handleStart);
      };
    });
  }

  // Fires when the DM levels a party up — same "filter to your campaigns, then surface a banner"
  // pattern as watchEncounterStarted (see ShellComponent).
  watchPartyLeveled(): Observable<PartyLeveledEvent> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleLeveled = (event: PartyLeveledEvent) => observer.next(event);
      this.socketService.connect();
      socket.on('party_leveled', handleLeveled);

      return () => {
        socket.off('party_leveled', handleLeveled);
      };
    });
  }
}
