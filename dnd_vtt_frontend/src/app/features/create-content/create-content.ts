import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DmMonstersComponent } from './monsters/dm-monsters';

type CreateSection = 'monsters' | 'equipement' | 'spells';

// Routed at campaigns/manage/:campaignId/create (see app.routes.ts), reachable from the campaign
// hub's admin-only "Create" link — monster/equipment/spell authoring still writes to the one
// shared library, not campaign-scoped data, despite living under a specific campaign's URL.
@Component({
  selector: 'app-create-content',
  imports: [RouterLink, MatIconModule, DmMonstersComponent],
  templateUrl: './create-content.html',
  styleUrl: './create-content.scss',
})
export class CreateContentComponent {
  private route = inject(ActivatedRoute);
  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  activeSection = signal<CreateSection>('monsters');
}
