import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DescriptionDialogData {
  title: string;
  description: string;
  placeholder?: string;
}

@Component({
  selector: 'app-description-dialog',
  imports: [FormsModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title class="font-brand text-parchment">{{ data.title }}</h2>
    <mat-dialog-content class="!py-2">
      <textarea class="field-input w-full" rows="8" [placeholder]="data.placeholder ?? ''"
                [(ngModel)]="draft" name="description" autofocus></textarea>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-6 !pb-5 gap-2">
      <button class="btn-ghost" [mat-dialog-close]="undefined">Cancel</button>
      <button class="btn-primary" [mat-dialog-close]="draft">Save</button>
    </mat-dialog-actions>
  `,
})
export class DescriptionDialogComponent {
  readonly data = inject<DescriptionDialogData>(MAT_DIALOG_DATA);

  draft = this.data.description;
}
