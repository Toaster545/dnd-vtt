import { Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DmCharactersComponent } from './dm-characters/dm-characters';
import { DmMonstersComponent } from './dm-monsters/dm-monsters';

type CreateSection = 'characters' | 'monsters' | 'equipement' | 'spells';

@Component({
  selector: 'app-dm-create',
  imports: [MatIconModule, DmCharactersComponent, DmMonstersComponent],
  templateUrl: './dm-create.html',
  styleUrl: './dm-create.scss',
})
export class DmCreateComponent {
  activeSection = signal<CreateSection>('characters');
}
