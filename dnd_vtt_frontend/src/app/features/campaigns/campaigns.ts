import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../core/services/campaign.service';
import { CharacterService } from '../../core/services/character.service';
import { Campaign } from '../../core/models/campaign.model';
import { Character } from '../../core/models/character.model';
import { ConfirmService } from '../../shared/confirm.service';

type NewCampaignMode = 'join' | 'create';

// Merged replacement for the old dm-campaigns/player-campaigns split — everyone can both create
// campaigns (becoming that campaign's DM) and join others (becoming a member), so the list and
// the "new campaign" flow are the same component for every user, not one per role. CampaignService
// .getAll() already returns the union of owned + joined, each tagged `is_owner` (see
// CampaignsService.findAllForUser on the backend) so this only has to branch on that flag, not on
// who's logged in.
@Component({
  selector: 'app-campaigns',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule],
  templateUrl: './campaigns.html',
})
export class CampaignsComponent implements OnInit {
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);
  private confirm          = inject(ConfirmService);

  campaigns  = signal<Campaign[]>([]);
  characters = signal<Character[]>([]);
  loading    = signal(true);

  showForm = signal(false);
  mode     = signal<NewCampaignMode>('join');

  // Create
  newName        = '';
  newDescription = '';
  saving         = signal(false);

  // Join
  joining      = signal(false);
  joinError    = signal<string | null>(null);
  selectedCharacterId = signal<string | null>(null);
  joinCode = '';

  uploadingBackgroundId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  private async load() {
    const [campaigns, characters] = await Promise.all([
      this.campaignService.getAll(),
      this.characterService.getMyCharacters(),
    ]);
    this.campaigns.set(campaigns);
    this.characters.set(characters);
    this.loading.set(false);
  }

  openForm(mode: NewCampaignMode) {
    this.mode.set(mode);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.joinError.set(null);
  }

  selectCharacter(id: string) {
    this.selectedCharacterId.set(id);
  }

  async createCampaign() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await this.campaignService.create(this.newName.trim(), this.newDescription.trim());
      this.newName        = '';
      this.newDescription = '';
      this.showForm.set(false);
      await this.load();
    } finally { this.saving.set(false); }
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
      this.showForm.set(false);
      await this.load();
    } catch {
      this.joinError.set('No campaign with that code.');
    } finally {
      this.joining.set(false);
    }
  }

  async deleteCampaign(campaign: Campaign, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!await this.confirm.confirm(`Delete "${campaign.name}"? This cannot be undone.`, 'Delete Campaign')) return;
    await this.campaignService.remove(campaign.id);
    await this.load();
  }

  async onBackgroundFileChange(campaign: Campaign, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackgroundId.set(campaign.id);
    try {
      await this.campaignService.uploadBackground(campaign.id, file);
      await this.load();
    } finally {
      this.uploadingBackgroundId.set(null);
    }
  }

  async clearBackground(campaign: Campaign, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    await this.campaignService.update(campaign.id, { background_url: null });
    await this.load();
  }

  campaignLink(campaign: Campaign): string[] {
    return campaign.is_owner ? ['/home/campaigns/manage', campaign.id] : ['/home/campaigns', campaign.id];
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
