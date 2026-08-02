import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DndMonster } from '../../../../../../core/services/content.service';
import { Character } from '../../../../../../core/models/character.model';
import { PresentPlayer } from '../../../../../../core/models/encounter.model';

@Component({
  selector: 'app-roster-panel',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './roster-panel.html',
})
export class RosterPanelComponent {
  readonly presentPlayers = input.required<PresentPlayer[]>();
  readonly monsters = input.required<DndMonster[]>();
  readonly characters = input.required<Character[]>();

  readonly classLabel = input.required<(c: Character) => string>();
  readonly colorFor = input.required<(id: string) => string>();
  readonly colorForMonster = input.required<(index: string) => string>();
  readonly isArmedCharacter = input.required<(id: string) => boolean>();
  readonly isArmedMonster = input.required<(index: string) => boolean>();
  readonly isArmedCustomToken = input(false);

  readonly showMonsterSearch = input(false);
  readonly monsterSearchQuery = input('');
  readonly availableMonstersToAdd = input.required<DndMonster[]>();
  readonly addingMonster = input(false);

  readonly armCustomToken = output<void>();
  readonly armPlayer = output<PresentPlayer>();
  readonly armMonster = output<DndMonster>();
  readonly armCharacter = output<Character>();
  readonly characterColorChanged = output<{ id: string; color: string }>();
  readonly monsterColorChanged = output<{ index: string; color: string }>();
  readonly openMonsterSearch = output<void>();
  readonly closeMonsterSearch = output<void>();
  readonly monsterSearchQueryChanged = output<string>();
  readonly addMonster = output<DndMonster>();
}
