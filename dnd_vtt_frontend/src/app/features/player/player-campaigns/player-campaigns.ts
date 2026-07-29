import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CampaignService } from '../../../core/services/campaign.service';
import { CharacterService } from '../../../core/services/character.service';
import { Campaign } from '../../../core/models/campaign.model';
import { Character } from '../../../core/models/character.model';

@Component({
  selector: 'app-player-campaigns',
  imports: [FormsModule, RouterLink, MatIconModule],
  templateUrl: './player-campaigns.html',
})
export class PlayerCampaignsComponent implements OnInit {
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);

  campaigns  = signal<Campaign[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  showJoinForm = signal(false);
  joining      = signal(false);
  joinError    = signal<string | null>(null);
  selectedCharacterId = signal<string | null>(null);
  joinCode = '';

  async ngOnInit() {
    const [campaigns, characters] = await Promise.all([
      this.campaignService.getAll(),
      this.characterService.getMyCharacters(),
    ]);
    this.campaigns.set(campaigns);
    this.characters.set(characters);
    this.loading.set(false);
  }

  selectCharacter(id: string) {
    this.selectedCharacterId.set(id);
  }

  async join() {
    const characterId = this.selectedCharacterId();
    if (!characterId || !this.joinCode.trim()) return;
    this.joining.set(true);
    this.joinError.set(null);
    try {
      await this.campaignService.join(this.joinCode.trim(), characterId);
      this.joinCode = '';
      this.selectedCharacterId.set(null);
      this.showJoinForm.set(false);
      this.campaigns.set(await this.campaignService.getAll());
    } catch {
      this.joinError.set('No campaign with that code.');
    } finally {
      this.joining.set(false);
    }
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }
}
