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

type Tab = 'create' | 'play';

// The player-facing counterpart to DmShellComponent — same Create/Play top-nav shape. Create reuses
// `DmCharactersComponent` as-is (no DM/admin-specific code, it just calls CharacterService as
// whoever is logged in); Play is routed (see app.routes.ts's /player children) since campaigns are
// the player's persistent "home base" — see PlayerCampaignsComponent and friends.
@Component({
  selector: 'app-player-shell',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, DmCharactersComponent],
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

  private syncActiveTabFromUrl(url: string) {
    this.activeTab.set(url.startsWith('/player/campaigns') ? 'play' : 'create');
  }

  selectCreate() {
    this.activeTab.set('create');
    if (this.router.url.startsWith('/player/campaigns')) void this.router.navigate(['/player']);
  }

  goToPlay() {
    this.activeTab.set('play');
    void this.router.navigate(['/player/campaigns']);
  }
}
