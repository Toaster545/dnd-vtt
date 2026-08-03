import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CharacterWizardComponent } from '../character-wizard/character-wizard';
import { CharacterService } from '../../../core/services/character.service';
import { RecentActivityService } from '../../../core/services/recent-activity.service';
import { Character } from '../../../core/models/character.model';

// Thin routed wrapper around the reusable <app-character-wizard/> (also embedded directly inside
// dm-campaign-hub/player-campaign-hub for their own character-creation flows, which stay
// untouched) — this one backs /home/characters/new and /home/characters/:id/edit so the wizard is
// deep-linkable and gets its own URL, matching how campaigns are routed under /home/campaigns.
@Component({
  selector: 'app-character-wizard-page',
  imports: [CharacterWizardComponent],
  templateUrl: './character-wizard-page.html',
  // Same fix as DmCampaignHubComponent: routed via <router-outlet>, a component stays an
  // unstyled inline element without a host sizing class, and the wizard's internal step/preview
  // panes collapse to zero height instead of scrolling.
  host: { class: 'flex flex-col flex-1 min-h-0' },
})
export class CharacterWizardPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private characterService = inject(CharacterService);
  private recentActivity = inject(RecentActivityService);

  ready = signal(false);
  character = signal<Character | null>(null);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const character = await this.characterService.getCharacter(id);
      this.recentActivity.markCharacterViewed(id);
      this.character.set(character);
    }
    this.ready.set(true);
  }

  onSaved() {
    void this.router.navigate(['/home']);
  }

  onCancelled() {
    void this.router.navigate(['/home']);
  }

  onViewSheet(id: string) {
    // Flagged so CharacterSheetPageComponent's back button returns here instead of to the
    // characters list — see its `cameFromWizard`.
    void this.router.navigate(['/home/characters', id], { queryParams: { from: 'wizard' } });
  }
}
