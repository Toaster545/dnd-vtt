import { Component, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/services/auth.service';

// The main "D&D Campaign" toolbar — title, Characters/Campaigns tabs, user info, sign out.
// Presentational only: which tab (if any) is highlighted comes from the `activeTab` input, and
// clicks are forwarded as outputs so each host page (ShellComponent, DashboardComponent) decides
// what they actually do (navigate, switch an inline view, etc.) rather than this component owning
// routing logic itself.
@Component({
  selector: 'app-header',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './app-header.html',
})
export class AppHeaderComponent {
  auth = inject(AuthService);

  activeTab = input<'characters' | 'campaigns' | 'content-library' | null>(null);

  selectCharacters     = output<void>();
  selectCampaigns      = output<void>();
  selectContentLibrary = output<void>();
  selectDashboard      = output<void>();
  selectSettings       = output<void>();
}
