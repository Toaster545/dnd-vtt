import { Component, input } from '@angular/core';
import { Character, ABILITIES, ABILITY_SHORT, SKILLS } from '../../../../core/models/character.model';
import { ComputedStats } from '../../../../core/services/character-stats.service';

// Read-only "how does this build actually play" stat block for the wizard's live preview pane
// — deliberately not the full play-sheet (no equipment/spell-tracking UI, nothing persists from
// here), just enough to sanity-check the numbers as they're built up across every step.
@Component({
  selector: 'app-character-preview',
  imports: [],
  templateUrl: './character-preview.html',
})
export class CharacterPreviewComponent {
  readonly character = input.required<Character>();
  readonly stats      = input.required<ComputedStats>();

  readonly abilities    = ABILITIES;
  readonly abilityShort: Record<string, string> = ABILITY_SHORT;
  readonly skillList    = Object.keys(SKILLS);
  readonly skillAbility: Record<string, string> = SKILLS;

  fmt(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }
}
