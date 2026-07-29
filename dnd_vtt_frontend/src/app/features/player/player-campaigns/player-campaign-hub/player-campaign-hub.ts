import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { CampaignHub } from '../../../../core/models/campaign.model';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';

@Component({
  selector: 'app-player-campaign-hub',
  imports: [RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent],
  templateUrl: './player-campaign-hub.html',
})
export class PlayerCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);

  async ngOnInit() {
    this.campaign.set(await this.campaignService.getById(this.campaignId));
    this.loading.set(false);
  }

  backToList() {
    void this.router.navigate(['/player/campaigns']);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
