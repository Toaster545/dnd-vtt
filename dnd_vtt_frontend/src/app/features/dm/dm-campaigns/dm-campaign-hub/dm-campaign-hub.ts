import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { SessionService } from '../../../../core/services/session.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CampaignHub, CampaignMember } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { Character } from '../../../../core/models/character.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';
import { CharacterWizardComponent } from '../../dm-create/dm-characters/character-wizard/character-wizard';

@Component({
  selector: 'app-dm-campaign-hub',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent, CharacterWizardComponent],
  templateUrl: './dm-campaign-hub.html',
  // Routed in via dm-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0 scroll chain has no bounded parent
  // to size against — same failure mode fixed on PlayerCampaignSessionComponent. Needed here so
  // the embedded character wizard's internal step/preview panes actually scroll instead of
  // collapsing to zero height.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private sessionService   = inject(SessionService);
  private characterService = inject(CharacterService);
  private confirm          = inject(ConfirmService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);
  copied   = signal(false);

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);

  showForm = signal(false);
  saving   = signal(false);
  newName        = '';
  newDescription = '';

  descriptionDraft    = '';
  savingDescription   = signal(false);
  uploadingBackground = signal(false);

  // A plain method, not computed() — descriptionDraft is an ngModel-bound field, not a signal, so
  // a computed() here would only re-evaluate when the campaign() signal changes and would ignore
  // every keystroke, leaving the Save button's [disabled] stuck at its first-render value.
  descriptionDirty(): boolean {
    return this.descriptionDraft.trim() !== (this.campaign()?.description ?? '').trim();
  }

  async ngOnInit() { await this.load(); }

  private async load() {
    this.loading.set(true);
    try {
      const campaign = await this.campaignService.getById(this.campaignId);
      this.campaign.set(campaign);
      this.descriptionDraft = campaign.description ?? '';
    } finally {
      this.loading.set(false);
    }
  }

  async saveDescription() {
    this.savingDescription.set(true);
    try {
      this.campaign.set(await this.campaignService.update(this.campaignId, { description: this.descriptionDraft.trim() }));
    } finally {
      this.savingDescription.set(false);
    }
  }

  async onBackgroundFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackground.set(true);
    try {
      this.campaign.set(await this.campaignService.uploadBackground(this.campaignId, file));
    } finally {
      this.uploadingBackground.set(false);
    }
  }

  async clearBackground() {
    this.campaign.set(await this.campaignService.update(this.campaignId, { background_url: null }));
  }

  async createSession() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await this.sessionService.create(this.campaignId, this.newName.trim(), this.newDescription.trim());
      this.newName        = '';
      this.newDescription = '';
      this.showForm.set(false);
      await this.load();
    } finally { this.saving.set(false); }
  }

  async toggleSessionVisibility(session: Session, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    await this.sessionService.setVisibility(session.id, !session.visible_to_players);
    await this.load();
  }

  async deleteSession(session: Session, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!await this.confirm.confirm(`Delete "${session.name}"? This cannot be undone.`, 'Delete Session')) return;
    await this.sessionService.remove(session.id);
    await this.load();
  }

  async removeMember(userId: string, name: string) {
    if (!await this.confirm.confirm(`Remove ${name} from this campaign? They can rejoin later with the campaign code.`, 'Remove Player')) return;
    await this.campaignService.removeMember(this.campaignId, userId);
    await this.load();
  }

  // Opens the DM's editable view of a player's campaign copy (member.character_id — see
  // CampaignsService.join(), which clones the player's character into a campaign-scoped row the
  // DM can freely edit without touching the player's original template).
  async openMember(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    await this.load();
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  async copyJoinCode() {
    const code = this.campaign()?.join_code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  backToList() {
    void this.router.navigate(['/dm/campaigns']);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
