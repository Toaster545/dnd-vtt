import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { EncounterService } from '../../core/services/encounter.service';
import { EncounterStartedEvent } from '../../core/models/encounter.model';
import { DmCharactersComponent } from '../dm/dm-create/dm-characters/dm-characters';
import { PlayerCharactersComponent } from './player-characters/player-characters';

type Tab = 'create' | 'characters' | 'play';

// The player-facing counterpart to DmShellComponent — same Create/Play top-nav shape, plus a
// third "Characters" tab the DM doesn't need (a DM's characters list already doubles as their
// campaign copies via the campaign hub roster). Create reuses `DmCharactersComponent` as-is (no
// DM/admin-specific code, it just calls CharacterService as whoever is logged in) to manage
// portable templates; Characters shows this player's per-campaign local copies
// (PlayerCharactersComponent); Play is routed (see app.routes.ts's /player children) since
// campaigns are the player's persistent "home base" — see PlayerCampaignsComponent and friends.
@Component({
  selector: 'app-player-shell',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, DmCharactersComponent, PlayerCharactersComponent],
  templateUrl: './player-shell.html',
})
export class PlayerShellComponent implements OnInit, OnDestroy {
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private encounterService = inject(EncounterService);
  auth = inject(AuthService);
  activeTab = signal<Tab>('create');

  // The moment a DM starts an encounter in any campaign this player belongs to, a dismissible
  // banner appears (see html) — a shortcut on top of the existing browse-and-join flow in
  // player-campaign-session, not a replacement for it.
  liveAlert = signal<EncounterStartedEvent | null>(null);
  private myCampaignIds = new Set<string>();
  private startedSub?: Subscription;

  async ngOnInit() {
    this.syncActiveTabFromUrl(this.router.url);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.syncActiveTabFromUrl((e as NavigationEnd).urlAfterRedirects);
    });

    const campaigns = await this.campaignService.getAll();
    this.myCampaignIds = new Set(campaigns.map(c => c.id));
    this.startedSub = this.encounterService.watchEncounterStarted().subscribe(event => {
      if (this.myCampaignIds.has(event.campaignId)) this.liveAlert.set(event);
    });
  }

  ngOnDestroy() {
    this.startedSub?.unsubscribe();
  }

  dismissAlert() {
    this.liveAlert.set(null);
  }

  joinLiveAlert() {
    const alert = this.liveAlert();
    if (!alert) return;
    this.liveAlert.set(null);
    this.activeTab.set('play');
    void this.router.navigate(
      ['/player/campaigns', alert.campaignId, 'sessions', alert.sessionId],
      { queryParams: { autojoin: alert.encounterId } },
    );
  }

  // 'create' and 'characters' both live at the same '/player' root URL (neither is routed), so
  // the URL alone can't distinguish them — only force a fallback out of 'play' when navigating
  // away from /player/campaigns; otherwise leave whichever non-play tab was already selected.
  private syncActiveTabFromUrl(url: string) {
    if (url.startsWith('/player/campaigns')) { this.activeTab.set('play'); return; }
    if (this.activeTab() === 'play') this.activeTab.set('create');
  }

  selectCreate() {
    this.activeTab.set('create');
    if (this.router.url.startsWith('/player/campaigns')) void this.router.navigate(['/player']);
  }

  selectCharacters() {
    this.activeTab.set('characters');
    if (this.router.url.startsWith('/player/campaigns')) void this.router.navigate(['/player']);
  }

  goToPlay() {
    this.activeTab.set('play');
    void this.router.navigate(['/player/campaigns']);
  }
}
