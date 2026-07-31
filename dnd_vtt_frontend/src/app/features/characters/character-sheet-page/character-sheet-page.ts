import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CharacterPlaySheetComponent } from '../character-play-sheet/character-play-sheet';
import { CharacterService } from '../../../core/services/character.service';
import { RecentActivityService } from '../../../core/services/recent-activity.service';
import { Character } from '../../../core/models/character.model';

// Routed wrapper backing /home/characters/:id — the counterpart to CharacterWizardPageComponent,
// giving the read/play sheet its own deep-linkable URL instead of being a signal-toggled sub-view
// of the characters list.
@Component({
  selector: 'app-character-sheet-page',
  imports: [CharacterPlaySheetComponent, MatIconModule],
  templateUrl: './character-sheet-page.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class CharacterSheetPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private characterService = inject(CharacterService);
  private recentActivity = inject(RecentActivityService);

  character = signal<Character | null>(null);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.recentActivity.markCharacterViewed(id);
    this.character.set(await this.characterService.getCharacter(id));
  }

  onSaved(character: Character) {
    this.character.set(character);
  }

  close() {
    void this.router.navigate(['/home']);
  }

  openCampaign() {
    const campaignId = this.character()?.campaign_id;
    if (campaignId) void this.router.navigate(['/home/campaigns', campaignId]);
  }
}
