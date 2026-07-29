import { Component, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { portraitDataUri, randomPortraitSeed } from '../../core/utils/avatar';

const GRID_SIZE = 12;

export interface PortraitPickerDialogData {
  seed: string;
}

@Component({
  selector: 'app-portrait-picker-dialog',
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title class="font-brand text-parchment">Choose a Portrait</h2>
    <mat-dialog-content class="!py-2">
      <div class="grid grid-cols-4 gap-3" style="width: 360px;">
        @for (p of portraits(); track p.seed) {
          <button
            type="button"
            class="w-20 h-20 rounded-full overflow-hidden border-2 p-0 cursor-pointer transition-colors bg-elevated"
            [class]="p.seed === data.seed ? 'border-gold' : 'border-white/10 hover:border-white/40'"
            [mat-dialog-close]="p.seed"
          >
            <img [src]="p.uri" class="w-full h-full" alt="" />
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-6 !pb-5 gap-2">
      <button class="btn-ghost" type="button" (click)="shuffle()">Shuffle</button>
      <button class="btn-ghost" [mat-dialog-close]="null">Cancel</button>
    </mat-dialog-actions>
  `,
})
export class PortraitPickerDialogComponent {
  readonly data = inject<PortraitPickerDialogData>(MAT_DIALOG_DATA);

  private seeds = signal<string[]>(this.freshSeeds());
  portraits = computed(() => this.seeds().map(seed => ({ seed, uri: portraitDataUri(seed) })));

  private freshSeeds(): string[] {
    return [this.data.seed, ...Array.from({ length: GRID_SIZE - 1 }, () => randomPortraitSeed())];
  }

  shuffle() {
    this.seeds.set(this.freshSeeds());
  }
}
