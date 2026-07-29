import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { SessionService } from '../../../../core/services/session.service';
import { CampaignHub } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';

@Component({
  selector: 'app-dm-campaign-hub',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent],
  templateUrl: './dm-campaign-hub.html',
})
export class DmCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private sessionService   = inject(SessionService);
  private confirm          = inject(ConfirmService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);
  copied   = signal(false);

  showForm = signal(false);
  saving   = signal(false);
  newName        = '';
  newDescription = '';

  async ngOnInit() { await this.load(); }

  private async load() {
    this.loading.set(true);
    try {
      this.campaign.set(await this.campaignService.getById(this.campaignId));
    } finally {
      this.loading.set(false);
    }
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
