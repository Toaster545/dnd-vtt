import { Component, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { statblockFileName, statblockNote } from '../../../core/utils/statblock-export';

// Icon button + menu offering an Obsidian Fantasy Statblocks export: copy the ```statblock block
// to the clipboard (to paste into an existing note) or download it as a standalone .md note.
// `build` is called lazily on click, so a list of many rows doesn't format every statblock upfront.
@Component({
  selector: 'app-statblock-export-menu',
  imports: [MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <button class="btn-icon" type="button" [matMenuTriggerFor]="menu"
      (click)="$event.stopPropagation()" matTooltip="Export to Obsidian">
      <mat-icon class="text-base">{{ copied() ? 'check' : 'ios_share' }}</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      <button mat-menu-item type="button" (click)="copy()">
        <mat-icon>content_copy</mat-icon> Copy statblock
      </button>
      <button mat-menu-item type="button" (click)="download()">
        <mat-icon>download</mat-icon> Download .md note
      </button>
    </mat-menu>
  `,
})
export class StatblockExportMenuComponent {
  readonly name = input.required<string>();
  readonly build = input.required<() => string>();
  readonly description = input<string | undefined>(undefined);

  copied = signal(false);

  async copy() {
    await navigator.clipboard.writeText(this.build()());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  download() {
    const note = statblockNote(this.build()(), this.description());
    const url = URL.createObjectURL(new Blob([note], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = statblockFileName(this.name());
    link.click();
    URL.revokeObjectURL(url);
  }
}
