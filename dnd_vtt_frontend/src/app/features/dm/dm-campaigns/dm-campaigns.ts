import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../core/services/campaign.service';
import { Campaign } from '../../../core/models/campaign.model';
import { ConfirmService } from '../../../shared/confirm.service';

@Component({
  selector: 'app-dm-campaigns',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule],
  templateUrl: './dm-campaigns.html',
})
export class DmCampaignsComponent implements OnInit {
  private campaignService = inject(CampaignService);
  private confirm         = inject(ConfirmService);

  campaigns = signal<Campaign[]>([]);
  loading   = signal(true);
  showForm  = signal(false);
  saving    = signal(false);
  newName        = '';
  newDescription = '';

  uploadingBackgroundId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }
  private async load() {
    this.campaigns.set(await this.campaignService.getAll());
    this.loading.set(false);
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

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
