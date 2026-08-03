import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DmMonstersComponent } from './monsters/dm-monsters';
import { DmItemsComponent } from './items/dm-items';
import { DmSpellsComponent } from './spells/dm-spells';

type CreateSection = 'monsters' | 'equipement' | 'spells';

// Routed at home/content-library (see app.routes.ts) — a personal library owned by the current
// user, reusable across every campaign they DM, not scoped to any single campaign.
@Component({
  selector: 'app-create-content',
  imports: [RouterLink, MatIconModule, DmMonstersComponent, DmItemsComponent, DmSpellsComponent],
  templateUrl: './create-content.html',
  styleUrl: './create-content.scss',
})
export class CreateContentComponent {
  activeSection = signal<CreateSection>('monsters');
}
