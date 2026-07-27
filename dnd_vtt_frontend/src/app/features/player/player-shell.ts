import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { DmCharactersComponent } from '../dm/dm-create/dm-characters/dm-characters';
import { PlayerPlayComponent } from './player-play/player-play';

type Tab = 'create' | 'play';

// The player-facing counterpart to DmShellComponent — same Create/Play top-nav shape, but scoped
// to just characters: `DmCharactersComponent` (list + wizard) has no DM/admin-specific code
// anywhere, it just calls CharacterService as whoever is logged in, so it's reused as-is here
// rather than duplicated.
@Component({
  selector: 'app-player-shell',
  imports: [MatIconModule, MatTooltipModule, DmCharactersComponent, PlayerPlayComponent],
  templateUrl: './player-shell.html',
})
export class PlayerShellComponent {
  auth = inject(AuthService);
  activeTab = signal<Tab>('create');
}
