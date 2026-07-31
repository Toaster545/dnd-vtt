import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { EncounterService } from '../../core/services/encounter.service';
import { EncounterStartedEvent } from '../../core/models/encounter.model';
import { CharactersComponent } from '../characters/characters';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { AppHeaderComponent } from '../../shared/layout/app-header/app-header';

type Tab = 'characters' | 'campaigns';

// Single nav shell for every logged-in user, replacing the old dm-shell/player-shell split — DM
// vs player was never really a property of the account, just of whether a given campaign's dm_id
// happens to match you (see CampaignsService.findAllForUser's is_owner flag). Characters is a
// plain signal-driven tab (no routing); Campaigns and everything below a specific campaign
// (hub/session/encounter) is routed under /home/campaigns, gated by ownership rather than a
// global role — see app.routes.ts.
@Component({
  selector: 'app-shell',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, CharactersComponent, MainLayoutComponent, AppHeaderComponent],
  templateUrl: './shell.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private encounterService = inject(EncounterService);
  auth = inject(AuthService);
  activeTab = signal<Tab>('characters');

  // The moment a DM starts an encounter in any campaign this user has joined (not one they own —
  // they'd already be the one starting it), a dismissible banner appears, a shortcut on top of the
  // existing browse-and-join flow in the campaign session view.
  liveAlert = signal<EncounterStartedEvent | null>(null);
  private myJoinedCampaignIds = new Set<string>();
  private startedSub?: Subscription;

  async ngOnInit() {
    this.syncActiveTabFromUrl(this.router.url);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.syncActiveTabFromUrl((e as NavigationEnd).urlAfterRedirects);
    });

    const campaigns = await this.campaignService.getAll();
    this.myJoinedCampaignIds = new Set(campaigns.filter(c => !c.is_owner).map(c => c.id));
    this.startedSub = this.encounterService.watchEncounterStarted().subscribe(event => {
      if (this.myJoinedCampaignIds.has(event.campaignId)) this.liveAlert.set(event);
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
    this.activeTab.set('campaigns');
    void this.router.navigate(
      ['/home/campaigns', alert.campaignId, 'sessions', alert.sessionId],
      { queryParams: { autojoin: alert.encounterId } },
    );
  }

  private syncActiveTabFromUrl(url: string) {
    if (url.startsWith('/home/campaigns')) this.activeTab.set('campaigns');
  }

  selectCharacters() {
    this.activeTab.set('characters');
    if (this.router.url.startsWith('/home/campaigns')) void this.router.navigate(['/home']);
  }

  goToCampaigns() {
    this.activeTab.set('campaigns');
    void this.router.navigate(['/home/campaigns']);
  }

  goToDashboard() {
    void this.router.navigate(['/dashboard']);
  }

  goToSettings() {
    void this.router.navigate(['/settings']);
  }
}
