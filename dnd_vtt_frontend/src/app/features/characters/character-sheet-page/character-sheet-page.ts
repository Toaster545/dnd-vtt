import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterPlaySheetComponent } from '../character-play-sheet/character-play-sheet';
import { CharacterService } from '../../../core/services/character.service';
import { RecentActivityService } from '../../../core/services/recent-activity.service';
import { Character } from '../../../core/models/character.model';
import { PlayerContextService } from '../../../core/services/player-context.service';

// Routed wrapper backing /home/characters/:id — the counterpart to CharacterWizardPageComponent,
// giving the read/play sheet its own deep-linkable URL instead of being a signal-toggled sub-view
// of the characters list.
@Component({
  selector: 'app-character-sheet-page',
  imports: [CharacterPlaySheetComponent, MatIconModule, MatTooltipModule],
  templateUrl: './character-sheet-page.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class CharacterSheetPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private characterService = inject(CharacterService);
  private recentActivity = inject(RecentActivityService);
  private playerContext = inject(PlayerContextService);

  character = signal<Character | null>(null);

  // Set when we arrived here via the wizard's "View Sheet" button (see
  // CharacterWizardPageComponent.onViewSheet) — routes the back button to the wizard instead of
  // the characters list in that case.
  cameFromWizard = this.route.snapshot.queryParamMap.get('from') === 'wizard';
  private characterId = this.route.snapshot.paramMap.get('id')!;

  async ngOnInit() {
    this.recentActivity.markCharacterViewed(this.characterId);
    const [character] = await Promise.all([
      this.characterService.getCharacter(this.characterId),
      this.playerContext.selectCharacter(this.characterId),
    ]);
    this.character.set(character);
  }

  onSaved(character: Character) {
    this.character.set(character);
  }

  close() {
    if (this.cameFromWizard) {
      void this.router.navigate(['/home/characters', this.characterId, 'edit']);
      return;
    }
    void this.router.navigate(['/home/characters']);
  }

  openCampaign() {
    const campaignId = this.character()?.campaign_id;
    if (campaignId) void this.router.navigate(['/home/campaigns', campaignId]);
  }
}
