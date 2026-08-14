import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
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
export class DmCampaignMapsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mapService = inject(BattleMapService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  maps = signal<BattleMap[]>([]);
  loading = signal(true);
  uploading = signal(false);
  error = signal<string | null>(null);
  newMapName = '';
  // How many grid squares tall the DM says the map is — the actual pixel grid size (`gridSize`
  // below) is derived from this plus the uploaded image's real dimensions, so nobody has to open
  // an image editor and measure a square by hand.
  verticalSquares = 20;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  imgWidth = 0;
  imgHeight = 0;

  // Pixel size of one grid cell in the source image, derived from its real height and the
  // requested row count. 0 until an image has finished loading.
  get gridSize(): number {
    return this.imgHeight > 0 && this.verticalSquares > 0
      ? Math.round(this.imgHeight / this.verticalSquares)
      : 0;
  }

  // Informational only — how many columns that implies, so the DM can sanity-check the count
  // against the map art (a whole number here usually means the grid lines up cleanly).
  get horizontalSquares(): number {
    return this.gridSize > 0 ? +(this.imgWidth / this.gridSize).toFixed(1) : 0;
  }

  get previewAspectRatio(): string {
    return this.imgWidth && this.imgHeight ? `${this.imgWidth} / ${this.imgHeight}` : 'auto';
  }

  // Grid-line overlay drawn on top of the preview image so the DM can see, before uploading,
  // whether the computed cell size actually lines up with the artwork's own grid. Percentage
  // stops in a `to right`/`to bottom` repeating-linear-gradient are relative to the box's
  // width/height, which is exactly the image's rendered size here.
  get gridOverlayBackground(): string {
    if (!this.imgWidth || !this.gridSize) return 'none';
    const colPct = (this.gridSize / this.imgWidth) * 100;
    const rowPct = 100 / this.verticalSquares;
    const line = 'rgba(255,90,90,0.85)';
    return (
      `repeating-linear-gradient(to right, ${line} 0, ${line} 1px, transparent 1px, transparent ${colPct}%),` +
      `repeating-linear-gradient(to bottom, ${line} 0, ${line} 1px, transparent 1px, transparent ${rowPct}%)`
    );
  }

  async ngOnInit() { await this.loadMaps(); }

  ngOnDestroy() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
  }

  private async loadMaps() {
    this.loading.set(true);
    try { this.maps.set(await this.mapService.getMapsForCampaign(this.campaignId)); }
    catch (e) { this.error.set(getErrorMessage(e)); }
    finally { this.loading.set(false); }
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile = file;

    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.imgWidth = 0;
    this.imgHeight = 0;
    if (!file) return;

    if (!this.newMapName) this.newMapName = file.name.replace(/\.[^.]+$/, '');

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.imgWidth = img.naturalWidth;
      this.imgHeight = img.naturalHeight;
      this.previewUrl = url;
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  async upload() {
    if (!this.selectedFile || !this.newMapName || !this.gridSize) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const url = await this.mapService.uploadMapImage(this.selectedFile, this.campaignId);
      await this.mapService.createMap({ campaign_id: this.campaignId, name: this.newMapName, image_url: url, grid_size: this.gridSize });
      this.newMapName = '';
      this.selectedFile = null;
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
      this.imgWidth = 0;
      this.imgHeight = 0;
      await this.loadMaps();
    } catch (e) { this.error.set(getErrorMessage(e)); }
    finally { this.uploading.set(false); }
  }

  backToHub() {
    void this.router.navigate(['/home/campaigns/manage', this.campaignId]);
  }
}
