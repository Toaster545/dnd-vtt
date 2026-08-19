import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PlayerContextService } from '../../../core/services/player-context.service';
import { getErrorMessage } from '../../../core/utils/error-message';

type CurrentTarget = 'campaign' | 'session' | 'encounter' | 'map';

@Component({
  selector: 'app-current-player-route',
  imports: [MatIconModule],
  template: `
    <section class="current-route" aria-live="polite">
      @if (loading()) {
        <div class="skeleton" aria-label="Loading current campaign"></div><div class="skeleton short"></div>
      } @else if (error()) {
        <mat-icon>cloud_off</mat-icon><h2>We couldn't load your current game</h2><p>{{ error() }}</p>
        <button class="btn-primary" type="button" (click)="load()">Try again</button>
      } @else {
        <mat-icon>explore_off</mat-icon><h2>Nothing current yet</h2>
        <p>Your DM can select a current session or start an encounter. You can also choose another campaign.</p>
        <button class="btn-primary" type="button" (click)="chooseCampaign()">Choose campaign</button>
      }
    </section>
  `,
  styles: [`
    .current-route { min-height: 60dvh; display: grid; place-content: center; justify-items: center; gap: .75rem; padding: 1.5rem; text-align: center; }
    .current-route mat-icon { width: 48px; height: 48px; font-size: 48px; color: var(--dnd-accent); }
    .current-route h2, .current-route p { margin: 0; max-width: 32rem; } .current-route p { color: var(--dnd-text-muted); }
    .skeleton { width: min(32rem, 80vw); height: 7rem; border-radius: .75rem; background: linear-gradient(90deg, #ffffff0d, #ffffff1c, #ffffff0d); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    .skeleton.short { height: 2rem; width: min(20rem, 60vw); } @keyframes shimmer { to { background-position: -200% 0; } }
  `],
})
export class CurrentPlayerRouteComponent implements OnInit {
  private context = inject(PlayerContextService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const state = await this.context.load();
      const campaignId = state.selected_campaign_id;
      const current = state.current_context;
      const target = this.route.snapshot.data['target'] as CurrentTarget;
      let commands: string[] | undefined;
      if (target === 'campaign' && campaignId) commands = ['/home/campaigns', campaignId];
      if (target === 'session' && campaignId && current?.current_session) commands = ['/home/campaigns', campaignId, 'sessions', current.current_session.id];
      if (target === 'encounter' && campaignId && current?.current_session && current.current_encounter) {
        await this.router.navigate(['/home/campaigns', campaignId, 'sessions', current.current_session.id], { queryParams: { autojoin: current.current_encounter.id } }); return;
      }
      if (target === 'map' && current?.current_encounter) commands = ['/encounters', current.current_encounter.id, 'player-view'];
      if (commands) { await this.router.navigate(commands); return; }
    } catch (error) { this.error.set(getErrorMessage(error)); }
    finally { this.loading.set(false); }
  }

  chooseCampaign(): void { void this.router.navigate(['/home/campaigns']); }
}
