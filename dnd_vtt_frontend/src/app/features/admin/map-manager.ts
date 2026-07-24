import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BattleMapService } from '../../core/services/battle-map.service';
import { BattleMap } from '../../core/models/campaign.model';

const CAMPAIGN_ID = 'default';

@Component({
  selector: 'app-map-manager',
  imports: [RouterLink, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './map-manager.html',
  styleUrl: './map-manager.scss',
})
export class MapManagerComponent implements OnInit {
  private mapService = inject(BattleMapService);
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
    try { this.maps.set(await this.mapService.getAllMaps()); }
    catch (e: any) { this.error.set(e.message); }
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
      const url = await this.mapService.uploadMapImage(this.selectedFile, CAMPAIGN_ID);
      await this.mapService.createMap({ campaign_id: CAMPAIGN_ID, name: this.newMapName, image_url: url, grid_size: this.newGridSize });
      this.newMapName = '';
      this.selectedFile = null;
      await this.loadMaps();
    } catch (e: any) { this.error.set(e.message); }
    finally { this.uploading.set(false); }
  }
}
