import { Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DmCharactersComponent } from './dm-characters/dm-characters';
import { DmSessionsComponent } from './dm-sessions/dm-sessions';

type CreateSection = 'sessions' | 'encounters' | 'characters' | 'items' | 'spells';

@Component({
  selector: 'app-dm-create',
  imports: [MatIconModule, DmCharactersComponent, DmSessionsComponent],
  templateUrl: './dm-create.html',
  styleUrl: './dm-create.scss',
})
export class DmCreateComponent {
  activeSection = signal<CreateSection>('characters');
}
