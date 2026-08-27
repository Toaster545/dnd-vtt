import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Encounter, EncounterStartedEvent, PresentPlayer } from '../models/encounter.model';
import { AvatarRecipeV1 } from '../models/avatar.model';
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
  watchTurnState(): Observable<{ current_turn_token_id: string | null; round_number: number }> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleUpdate = (state: { current_turn_token_id: string | null; round_number: number }) => observer.next(state);
      this.socketService.connect();
      socket.on('turn_changed', handleUpdate);

      return () => {
        socket.off('turn_changed', handleUpdate);
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
}
