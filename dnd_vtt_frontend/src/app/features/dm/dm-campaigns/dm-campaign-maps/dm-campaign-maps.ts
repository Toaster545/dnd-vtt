import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BattleMapService } from '../../../../core/services/battle-map.service';
import { BattleMap } from '../../../../core/models/campaign.model';
import { getErrorMessage } from '../../../../core/utils/error-message';

@Component({
  selector: 'app-dm-campaign-maps',
  imports: [RouterLink, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './dm-campaign-maps.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmCampaignMapsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mapService = inject(BattleMapService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  maps = signal<BattleMap[]>([]);
  loading = signal(true);
  uploading = signal(false);
  error = signal<string | null>(null);
  newMapName = '';
  newGridSize = 50;
  selectedFile: File | null = null;

  async ngOnInit() { await this.loadMaps(); }

  private async loadMaps() {
    this.loading.set(true);
    try { this.maps.set(await this.mapService.getMapsForCampaign(this.campaignId)); }
    catch (e) { this.error.set(getErrorMessage(e)); }
    finally { this.loading.set(false); }
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    if (this.selectedFile && !this.newMapName) this.newMapName = this.selectedFile.name.replace(/\.[^.]+$/, '');
  }

  async upload() {
    if (!this.selectedFile || !this.newMapName) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const url = await this.mapService.uploadMapImage(this.selectedFile, this.campaignId);
      await this.mapService.createMap({ campaign_id: this.campaignId, name: this.newMapName, image_url: url, grid_size: this.newGridSize });
      this.newMapName = '';
      this.selectedFile = null;
      await this.loadMaps();
    } catch (e) { this.error.set(getErrorMessage(e)); }
    finally { this.uploading.set(false); }
  }

  backToHub() {
    void this.router.navigate(['/home/campaigns/manage', this.campaignId]);
  }
}
