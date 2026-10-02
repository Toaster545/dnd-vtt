import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DndMonster } from '../../../../../../core/services/content.service';
import { Character } from '../../../../../../core/models/character.model';

// A party member's character, placeable whether or not their player has joined the encounter.
export interface RosterPlayer {
  characterId: string;
  characterName: string;
  username: string;
  present: boolean;
}

@Component({
  selector: 'app-roster-panel',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './roster-panel.html',
})
export class RosterPanelComponent {
  readonly players = input.required<RosterPlayer[]>();
  readonly monsters = input.required<DndMonster[]>();
  readonly characters = input.required<Character[]>();

  readonly classLabel = input.required<(c: Character) => string>();
  readonly isArmedCharacter = input.required<(id: string) => boolean>();
  readonly isArmedMonster = input.required<(index: string) => boolean>();
  readonly isArmedCustomToken = input(false);

  readonly showMonsterSearch = input(false);
  readonly monsterSearchQuery = input('');
  readonly availableMonstersToAdd = input.required<DndMonster[]>();
  readonly addingMonster = input(false);

  readonly armCustomToken = output<void>();
  readonly armPlayer = output<RosterPlayer>();
  readonly armMonster = output<DndMonster>();
  readonly armCharacter = output<Character>();
  readonly openMonsterSearch = output<void>();
  readonly closeMonsterSearch = output<void>();
  readonly monsterSearchQueryChanged = output<string>();
  readonly addMonster = output<DndMonster>();
  readonly removeMonster = output<DndMonster>();
}
