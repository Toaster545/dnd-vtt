import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title class="font-brand text-parchment">{{ data.title }}</h2>
    <mat-dialog-content class="text-slate text-sm !py-2">{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-6 !pb-5 gap-2">
      <button class="btn-ghost" [mat-dialog-close]="false">Cancel</button>
      <button class="btn-danger" [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
