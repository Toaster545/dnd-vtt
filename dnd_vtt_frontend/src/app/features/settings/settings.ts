import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { BackgroundService, customBackgroundCss } from '../../core/services/background.service';
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { AppHeaderComponent } from '../../shared/layout/app-header/app-header';

// Very basic settings page: an account section every user sees, plus an admin-only section
// gated on the same auth.isAdmin() signal adminGuard itself checks (see core/guards/admin.guard.ts)
// rather than duplicating role logic — more admin-only settings should be added under that guard.
@Component({
  selector: 'app-settings',
  imports: [MatIconModule, MatTooltipModule, MainLayoutComponent, AppHeaderComponent],
  templateUrl: './settings.html',
})
export class SettingsComponent {
  private router = inject(Router);
  auth = inject(AuthService);
  background = inject(BackgroundService);
  customBackgroundCss = customBackgroundCss;

  goToCharacters() {
    void this.router.navigate(['/home']);
  }

  goToCampaigns() {
    void this.router.navigate(['/home/campaigns']);
  }

  goToDashboard() {
    void this.router.navigate(['/dashboard']);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
