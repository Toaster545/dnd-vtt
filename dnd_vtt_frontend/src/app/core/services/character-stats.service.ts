import { Injectable } from '@angular/core';
import { Character, Ability, ABILITIES, SKILLS, abilityModifier, proficiencyBonus } from '../models/character.model';
import { DndClass, DndRace } from './content.service';

export interface ComputedStats {
  proficiency_bonus: number;
  ability_modifiers: Record<Ability, number>;
  suggested_max_hp: number;
  initiative: number;
  saving_throw_proficient: Set<string>;
  saving_throw_bonuses: Record<Ability, number>;
  skill_bonuses: Record<string, number>;
  passive_perception: number;
  spell_attack_bonus: number | null;
  spell_save_dc: number | null;
}

@Injectable({ providedIn: 'root' })
export class CharacterStatsService {
  compute(char: Character, classData: DndClass | null, raceData: DndRace | null): ComputedStats {
    const prof = proficiencyBonus(char.level);
    const scores = char.ability_scores;

    const mods = ABILITIES.reduce((acc, ab) => ({
      ...acc, [ab]: abilityModifier(scores[ab] ?? 10),
    }), {} as Record<Ability, number>);

    const hit_die = classData?.hit_die ?? 8;
    const suggested_max_hp = Math.max(1,
      hit_die + mods.constitution +
      (char.level - 1) * (Math.floor(hit_die / 2) + 1 + mods.constitution),
    );

    const saveProfSet = new Set(classData?.saving_throws ?? []);
    const saving_throw_bonuses = ABILITIES.reduce((acc, ab) => ({
      ...acc, [ab]: mods[ab] + (saveProfSet.has(ab) ? prof : 0),
    }), {} as Record<Ability, number>);

    const skill_bonuses = Object.fromEntries(
      Object.entries(SKILLS).map(([skill, ability]) => {
        const proficient = !!(char.skills?.[skill]);
        const expert   = !!(char.expertise?.[skill]);
        return [skill, mods[ability] + (expert ? prof * 2 : proficient ? prof : 0)];
      }),
    );

    const passive_perception = 10 + (skill_bonuses['Perception'] ?? mods.wisdom);

    const spellcastingAbility = classData?.spellcasting_ability as Ability | undefined;
    const spell_attack_bonus = spellcastingAbility != null
      ? prof + mods[spellcastingAbility] : null;
    const spell_save_dc = spellcastingAbility != null
      ? 8 + prof + mods[spellcastingAbility] : null;

    return {
      proficiency_bonus: prof,
      ability_modifiers: mods,
      suggested_max_hp,
      initiative: mods.dexterity,
      saving_throw_proficient: saveProfSet,
      saving_throw_bonuses,
      skill_bonuses,
      passive_perception,
      spell_attack_bonus,
      spell_save_dc,
    };
  }

  fmt(n: number): string { return n >= 0 ? `+${n}` : `${n}`; }
}
