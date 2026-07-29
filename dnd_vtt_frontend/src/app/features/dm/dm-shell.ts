import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { DmCreateComponent } from './dm-create/dm-create';
import { DmPlayComponent } from './dm-play/dm-play';

type Tab = 'create' | 'play' | 'campaigns';
type PlaySubTab = 'encounters' | 'characters';

@Component({
  selector: 'app-dm-shell',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, DmCreateComponent, DmPlayComponent],
  templateUrl: './dm-shell.html',
  styleUrl: './dm-shell.scss',
})
export class DmShellComponent implements OnInit {
  private router = inject(Router);
  auth = inject(AuthService);
  activeTab    = signal<Tab>('create');
  playSubTab   = signal<PlaySubTab>('encounters');
  playMenuOpen = signal(false);

  ngOnInit() {
    this.syncActiveTabFromUrl(this.router.url);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.syncActiveTabFromUrl((e as NavigationEnd).urlAfterRedirects);
    });
  }

  // Runs on every navigation, not just at component creation — DmShellComponent is reused across
  // /dm and /dm/campaigns/... (same top-level route), so a one-time ngOnInit check would miss a
  // campaign session's "Play" link navigating back to bare /dm and leave the campaigns tab/outlet
  // selected with nothing left to render in it.
  private syncActiveTabFromUrl(url: string) {
    if (url.startsWith('/dm/campaigns')) {
      this.activeTab.set('campaigns');
      return;
    }
    // A campaign session's encounter row links here with ?view=play-encounters(&encounterId=...) to
    // hand off into the existing live-play board, since that flow still owns start/stop/tokens.
    const query = url.split('?')[1];
    if (query && new URLSearchParams(query).get('view') === 'play-encounters') {
      this.selectPlay('encounters');
    }
  }

  selectPlay(tab: PlaySubTab) {
    this.selectTab('play');
    this.playSubTab.set(tab);
    this.playMenuOpen.set(false);
  }

  // Create/Play are plain signal-driven tabs (no routing) — leaving a nested /dm/campaigns/... URL
  // to go back to one of them needs an explicit navigation back to the bare /dm route.
  selectTab(tab: 'create' | 'play') {
    this.activeTab.set(tab);
    if (this.router.url.startsWith('/dm/campaigns')) void this.router.navigate(['/dm']);
  }

  goToCampaigns() {
    this.activeTab.set('campaigns');
    void this.router.navigate(['/dm/campaigns']);
  }
}
