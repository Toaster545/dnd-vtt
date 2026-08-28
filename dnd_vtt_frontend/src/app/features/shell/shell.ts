import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { CharacterService } from '../../core/services/character.service';
import { EncounterService } from '../../core/services/encounter.service';
import { EncounterStartedEvent, PartyLeveledEvent } from '../../core/models/encounter.model';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { AppHeaderComponent } from '../../shared/layout/app-header/app-header';
import { SettingsDialogComponent } from '../settings/settings-dialog';

type Tab = 'dashboard' | 'characters' | 'campaigns' | 'content-library';

// Single nav shell for every logged-in user, replacing the old dm-shell/player-shell split — DM
// vs player was never really a property of the account, just of whether a given campaign's dm_id
// happens to match you (see CampaignsService.findAllForUser's is_owner flag). Both Characters
// (empty path + /characters/*) and Campaigns (/campaigns/*) are routed under /home via a single
// <router-outlet> — activeTab only drives which header tab-pill is highlighted, derived from the
// URL in syncActiveTabFromUrl, not which view renders.
@Component({
  selector: 'app-shell',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, RouterLink, RouterLinkActive, MainLayoutComponent, AppHeaderComponent],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);
  private encounterService = inject(EncounterService);
  private dialog           = inject(MatDialog);
  auth = inject(AuthService);
  activeTab = signal<Tab>('dashboard');

  // The moment a DM starts an encounter in any campaign this user has joined (not one they own —
  // they'd already be the one starting it), a dismissible banner appears, a shortcut on top of the
  // existing browse-and-join flow in the campaign session view.
  liveAlert = signal<EncounterStartedEvent | null>(null);
  // Same idea for a party level-up: the DM bumped the party, so surface a banner that jumps
  // straight into the one-shot Level-Up flow for this member's own character in that campaign.
  levelUpAlert = signal<{ campaignName: string; level: number; characterId: string } | null>(null);
  private myJoinedCampaignIds = new Set<string>();
  private startedSub?: Subscription;
  private leveledSub?: Subscription;

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
    this.leveledSub = this.encounterService.watchPartyLeveled().subscribe(event => {
      if (this.myJoinedCampaignIds.has(event.campaignId)) void this.onPartyLeveled(event);
    });
  }

  ngOnDestroy() {
    this.startedSub?.unsubscribe();
    this.leveledSub?.unsubscribe();
  }

  // Resolve which of the viewer's characters the bump affects (one campaign copy per campaign)
  // and only raise the banner if a level-up is genuinely outstanding on it.
  private async onPartyLeveled(event: PartyLeveledEvent) {
    try {
      const copies = await this.characterService.getMyCampaignCopies();
      const mine = copies.find(character => character.campaign_id === event.campaignId);
      if (!mine?.id) return;
      if (mine.applied_level != null && mine.applied_level >= mine.level) return;
      this.levelUpAlert.set({
        campaignName: event.campaignName,
        level: event.level,
        characterId: mine.id,
      });
    } catch {
      /* transient fetch failure — the dashboard/sheet entry points still cover it */
    }
  }

  dismissAlert() {
    this.liveAlert.set(null);
  }

  dismissLevelUpAlert() {
    this.levelUpAlert.set(null);
  }

  openLevelUpAlert() {
    const alert = this.levelUpAlert();
    if (!alert) return;
    this.levelUpAlert.set(null);
    void this.router.navigate(['/home/characters', alert.characterId, 'level-up']);
  }

  joinLiveAlert() {
    const alert = this.liveAlert();
    if (!alert) return;
    this.liveAlert.set(null);
    void this.router.navigate(
      ['/home/campaigns', alert.campaignId, 'sessions', alert.sessionId],
      { queryParams: { autojoin: alert.encounterId } },
    );
  }

  private syncActiveTabFromUrl(url: string) {
    if (url.startsWith('/home/dashboard')) this.activeTab.set('dashboard');
    else if (url.startsWith('/home/content-library')) this.activeTab.set('content-library');
    else if (url.startsWith('/home/campaigns')) this.activeTab.set('campaigns');
    else this.activeTab.set('characters');
  }

  selectCharacters() {
    void this.router.navigate(['/home/characters']);
  }

  goToCampaigns() {
    void this.router.navigate(['/home/campaigns']);
  }

  goToContentLibrary() {
    void this.router.navigate(['/home/content-library']);
  }

  goToDashboard() {
    void this.router.navigate(['/home/dashboard']);
  }

  goToSettings() {
    this.dialog.open(SettingsDialogComponent, { width: '700px', maxWidth: '95vw', maxHeight: '85vh' });
  }
}
