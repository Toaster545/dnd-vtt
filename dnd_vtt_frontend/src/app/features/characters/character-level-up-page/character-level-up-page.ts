import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CharacterWizardComponent } from '../character-wizard/character-wizard';
import { CharacterService } from '../../../core/services/character.service';
import { RecentActivityService } from '../../../core/services/recent-activity.service';
import { Character } from '../../../core/models/character.model';

// Routed wrapper for /home/characters/:id/level-up — the same reusable <app-character-wizard/>
// the create/edit pages use, but in `levelUp` mode: only the Class and Spells steps, only the
// newly-reached level editable, and a single one-shot write through POST /characters/:id/level-up
// (which the backend accepts even on a DM-locked campaign copy). Reachability is gated by
// levelUpPendingGuard; entry points (dashboard, play sheet, party list, character list) link here.
@Component({
  selector: 'app-character-level-up-page',
  imports: [CharacterWizardComponent],
  templateUrl: './character-level-up-page.html',
  host: { class: 'flex flex-col flex-1 min-h-0' },
})
export class CharacterLevelUpPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private characterService = inject(CharacterService);
  private recentActivity = inject(RecentActivityService);

  ready = signal(false);
  character = signal<Character | null>(null);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      try {
        const character = await this.characterService.getCharacter(id);
        this.recentActivity.markCharacterViewed(id);
        this.character.set(character);
      } catch {
        void this.router.navigate(['/home/characters']);
        return;
      }
    }
    this.ready.set(true);
  }

  onDone() {
    const id = this.character()?.id;
    void this.router.navigate(id ? ['/home/characters', id] : ['/home/characters']);
  }

  onCancelled() {
    const id = this.character()?.id;
    void this.router.navigate(id ? ['/home/characters', id] : ['/home/characters']);
  }
}
