import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { DmCreateComponent } from './dm-create/dm-create';
import { DmPlayComponent } from './dm-play/dm-play';

type Tab = 'create' | 'play';
type PlaySubTab = 'sessions' | 'encounters' | 'characters';

@Component({
  selector: 'app-dm-shell',
  imports: [MatIconModule, MatTooltipModule, DmCreateComponent, DmPlayComponent],
  templateUrl: './dm-shell.html',
  styleUrl: './dm-shell.scss',
})
export class DmShellComponent {
  auth = inject(AuthService);
  activeTab    = signal<Tab>('create');
  playSubTab   = signal<PlaySubTab>('sessions');
  playMenuOpen = signal(false);

  selectPlay(tab: PlaySubTab) {
    this.activeTab.set('play');
    this.playSubTab.set(tab);
    this.playMenuOpen.set(false);
  }
}
