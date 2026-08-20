import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { BackgroundService, customBackgroundCss } from '../../core/services/background.service';
import { COLOR_SCHEME_OPTIONS, ColorSchemeService } from '../../core/services/color-scheme.service';
import { UI_SCALE_OPTIONS, UiScaleService } from '../../core/services/ui-scale.service';
import { UserAdminService } from '../../core/services/user-admin.service';
import { UserProfile, UserRole } from '../../core/models/user.model';
import { getErrorMessage } from '../../core/utils/error-message';
import { ConfirmService } from '../../shared/confirm.service';
import { PwaService } from '../../core/services/pwa.service';

interface UserEditForm {
  username: string;
  email: string;
  role: UserRole;
  password: string;
}

// Settings, opened as a MatDialog overlay (see ShellComponent/DashboardComponent goToSettings())
// rather than routed to, so it always floats on top of whatever page the user was on and closes
// via the default backdrop-click behavior. An account section every user sees, plus an admin-only
// section gated on the same auth.isAdmin() signal adminGuard itself checks
// (see core/guards/admin.guard.ts) rather than duplicating role logic — more admin-only settings
// should be added under that guard.
@Component({
  selector: 'app-settings-dialog',
  imports: [FormsModule, MatDialogModule, MatIconModule, MatTooltipModule],
  templateUrl: './settings-dialog.html',
})
export class SettingsDialogComponent implements OnInit {
  private userAdmin = inject(UserAdminService);
  private confirm = inject(ConfirmService);
  auth = inject(AuthService);
  background = inject(BackgroundService);
  customBackgroundCss = customBackgroundCss;
  uiScale = inject(UiScaleService);
  uiScaleOptions = UI_SCALE_OPTIONS;
  colorScheme = inject(ColorSchemeService);
  colorSchemeOptions = COLOR_SCHEME_OPTIONS;
  pwa = inject(PwaService);

  users = signal<UserProfile[]>([]);
  usersLoading = signal(false);
  usersError = signal('');

  editingUserId = signal<string | null>(null);
  editForm: UserEditForm = { username: '', email: '', role: 'player', password: '' };
  savingUserId = signal<string | null>(null);
  editError = signal('');

  ngOnInit() {
    if (this.auth.isAdmin()) void this.loadUsers();
  }

  private async loadUsers() {
    this.usersLoading.set(true);
    this.usersError.set('');
    try {
      this.users.set(await this.userAdmin.getAll());
    } catch (e) {
      this.usersError.set(getErrorMessage(e));
    } finally {
      this.usersLoading.set(false);
    }
  }

  startEditUser(user: UserProfile) {
    this.editingUserId.set(user.id);
    this.editForm = { username: user.username, email: user.email, role: user.role, password: '' };
    this.editError.set('');
  }

  cancelEditUser() {
    this.editingUserId.set(null);
    this.editError.set('');
  }

  async saveEditUser(user: UserProfile) {
    this.savingUserId.set(user.id);
    this.editError.set('');
    try {
      const patch: Record<string, string> = {};
      if (this.editForm.username !== user.username) patch['username'] = this.editForm.username;
      if (this.editForm.email !== user.email) patch['email'] = this.editForm.email;
      if (this.editForm.role !== user.role) patch['role'] = this.editForm.role;
      if (this.editForm.password.trim()) patch['password'] = this.editForm.password.trim();

      const updated = await this.userAdmin.update(user.id, patch);
      this.users.update((list) => list.map((u) => (u.id === user.id ? updated : u)));
      this.editingUserId.set(null);
    } catch (e) {
      this.editError.set(getErrorMessage(e));
    } finally {
      this.savingUserId.set(null);
    }
  }

  async deleteUser(user: UserProfile) {
    if (!await this.confirm.confirm(
      `Delete the account "${user.username}"? This cannot be undone.`,
      'Delete Account',
    )) return;
    try {
      await this.userAdmin.remove(user.id);
      this.users.update((list) => list.filter((u) => u.id !== user.id));
    } catch (e) {
      this.usersError.set(getErrorMessage(e));
    }
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  installNatOne() {
    void this.pwa.install();
  }
}
