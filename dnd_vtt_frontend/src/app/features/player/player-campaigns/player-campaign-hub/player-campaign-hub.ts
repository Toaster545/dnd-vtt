import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { CharacterService } from '../../../../core/services/character.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CampaignHub, CampaignMember } from '../../../../core/models/campaign.model';
import { Character } from '../../../../core/models/character.model';
import { portraitDataUri } from '../../../../core/utils/avatar';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';
import { CharacterWizardComponent } from '../../../dm/dm-create/dm-characters/character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from '../../../dm/dm-play/character-play-sheet/character-play-sheet';

@Component({
  selector: 'app-player-campaign-hub',
  imports: [
    RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent, CharacterWizardComponent,
    CharacterPlaySheetComponent,
  ],
  templateUrl: './player-campaign-hub.html',
  // Routed in via player-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0/overflow-y-auto root div has no
  // bounded parent to size against — it just grows to content height instead of filling the
  // screen. Same fix as DmCampaignHubComponent / DmCampaignSessionComponent / PlayerCampaignSessionComponent.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class PlayerCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);
  private auth              = inject(AuthService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter = signal<Character | null>(null);

  async ngOnInit() {
    this.campaign.set(await this.campaignService.getById(this.campaignId));
    this.loading.set(false);
  }

  backToList() {
    void this.router.navigate(['/player/campaigns']);
  }

  isMe(member: CampaignMember): boolean {
    return member.user_id === this.auth.profile()?.id;
  }

  // Falls back to the character id as the DiceBear seed for members created before portraits
  // existed — still deterministic per-character, just not one the player ever explicitly picked.
  portraitFor(member: CampaignMember): string {
    return portraitDataUri(member.character_portrait_seed || member.character_id);
  }

  // The DM grants this per member (see DmCampaignHubComponent.toggleEditAccess) — otherwise a
  // player's campaign copy only accepts the play sheet's limited HP/rest/equipment writes.
  async editMyCharacter(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    this.campaign.set(await this.campaignService.getById(this.campaignId));
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  async viewMyCharacter(member: CampaignMember) {
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  // The play sheet's (saved) emits the updated character after every persist — keep the sheet in
  // sync and refresh the Party roster's HP/AC badges to match, but stay on the sheet (unlike the
  // wizard's onCharacterSaved, which navigates back to the hub).
  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    this.campaign.set(await this.campaignService.getById(this.campaignId));
  }

  closeCharacterSheet() {
    this.sheetCharacter.set(null);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
