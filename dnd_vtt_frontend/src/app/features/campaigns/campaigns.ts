import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../core/services/campaign.service';
import { CharacterService } from '../../core/services/character.service';
import { ContentService, DndContentSource } from '../../core/services/content.service';
import { Campaign, CampaignJoinPreview } from '../../core/models/campaign.model';
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
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class CampaignsComponent implements OnInit {
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);
  private contentService   = inject(ContentService);
  private confirm          = inject(ConfirmService);

  campaigns  = signal<Campaign[]>([]);
  characters = signal<Character[]>([]);
  sources    = signal<DndContentSource[]>([]);
  loading    = signal(true);

  showForm = signal(false);
  mode     = signal<NewCampaignMode>('join');

  // Create
  newName        = '';
  newDescription = '';
  saving         = signal(false);
  allowedSources = signal(new Set(['XPHB']));
  createSourcesExpanded = signal(false);

  // Join
  joining      = signal(false);
  joinError    = signal<string | null>(null);
  joinPreview  = signal<CampaignJoinPreview | null>(null);
  previewingJoin = signal(false);
  selectedCharacterId = signal<string | null>(null);
  joinCode = '';

  uploadingBackgroundId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  private async load() {
    const [campaigns, characters, sources] = await Promise.all([
      this.campaignService.getAll(),
      this.characterService.getMyCharacters(),
      this.contentService.getSources(),
    ]);
    this.campaigns.set(campaigns);
    this.characters.set(characters);
    this.sources.set(sources);
    this.loading.set(false);
  }

  openForm(mode: NewCampaignMode) {
    this.mode.set(mode);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.joinError.set(null);
    this.joinPreview.set(null);
  }

  selectCharacter(id: string) {
    if (this.characterCompatibility(id)?.compatible === false) return;
    this.selectedCharacterId.set(id);
  }

  sourceAllowed(source: DndContentSource): boolean {
    return this.allowedSources().has(source.code);
  }

  toggleAllowedSource(source: DndContentSource) {
    if (source.code === 'XPHB') return;
    const next = new Set(this.allowedSources());
    if (next.has(source.code)) next.delete(source.code);
    else next.add(source.code);
    this.allowedSources.set(next);
  }

  sourceLabel(code: string): string {
    return this.sources().find(source => source.code === code)?.short_name ?? code;
  }

  characterCompatibility(characterId?: string) {
    if (!characterId) return undefined;
    return this.joinPreview()?.characters.find(character => character.character_id === characterId);
  }

  async onJoinCodeChange(value: string) {
    this.joinCode = value.toUpperCase();
    this.joinPreview.set(null);
    this.joinError.set(null);
    if (this.joinCode.trim().length !== 6) return;
    const requestedCode = this.joinCode.trim();
    this.previewingJoin.set(true);
    try {
      const preview = await this.campaignService.previewJoin(requestedCode);
      if (this.joinCode.trim() !== requestedCode) return;
      this.joinPreview.set(preview);
      if (this.characterCompatibility(this.selectedCharacterId() ?? undefined)?.compatible === false) {
        this.selectedCharacterId.set(null);
      }
    } catch (error) {
      if (this.joinCode.trim() !== requestedCode) return;
      this.joinError.set(this.errorMessage(error, 'No campaign with that code.'));
    } finally {
      this.previewingJoin.set(false);
    }
  }

  async createCampaign() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await this.campaignService.create(
        this.newName.trim(),
        this.newDescription.trim(),
        [...this.allowedSources()],
      );
      this.newName        = '';
      this.newDescription = '';
      this.allowedSources.set(new Set(['XPHB']));
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
    } catch (error) {
      this.joinError.set(this.errorMessage(error, 'Could not join that campaign.'));
    } finally {
      this.joining.set(false);
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { message?: string | string[] } };
    const message = response?.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || fallback;
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
