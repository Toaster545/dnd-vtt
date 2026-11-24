import { ABILITIES, Ability } from '../models/character.model';
import { DndBackground, TraitGrant } from '../services/content.service';

export const BACKGROUND_ABILITY_OPTIONS_KEY = 'background_ability_options';

type AbilityGrant = Extract<TraitGrant, { type: 'ability_choice' }>;

export function backgroundAbilityGrant(background: DndBackground | null): AbilityGrant | null {
  const grant = background?.grants?.find((candidate) => candidate.type === 'ability_choice');
  return grant?.type === 'ability_choice' ? grant : null;
}

export function defaultBackgroundAbilities(background: DndBackground | null): Ability[] {
  return (backgroundAbilityGrant(background)?.abilities ?? []).filter(
    (ability): ability is Ability => ABILITIES.includes(ability as Ability),
  );
}

export function isValidBackgroundAbilityOptions(value: string[] | undefined): value is Ability[] {
  return (
    value?.length === 3 &&
    new Set(value).size === 3 &&
    value.every((ability) => ABILITIES.includes(ability as Ability))
  );
}

export function resolveBackgroundAbilities(
  background: DndBackground | null,
  choices: Record<string, string[]> | null | undefined,
): Ability[] {
  const customized = choices?.[BACKGROUND_ABILITY_OPTIONS_KEY];
  return isValidBackgroundAbilityOptions(customized)
    ? customized
    : defaultBackgroundAbilities(background);
}

export function hasCustomizedBackgroundAbilities(
  background: DndBackground | null,
  choices: Record<string, string[]> | null | undefined,
): boolean {
  const customized = choices?.[BACKGROUND_ABILITY_OPTIONS_KEY];
  if (!isValidBackgroundAbilityOptions(customized)) return false;
  const defaults = defaultBackgroundAbilities(background);
  return (
    defaults.length !== customized.length ||
    customized.some((ability) => !defaults.includes(ability))
  );
}

export function resolveBackgroundAbilityBonuses(
  background: DndBackground | null,
  choices: Record<string, string[]> | null | undefined,
): Record<Ability, number> {
  const bonuses: Record<Ability, number> = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
  const grant = backgroundAbilityGrant(background);
  if (!grant) return bonuses;
  const eligible = resolveBackgroundAbilities(background, choices);
  let spent = 0;
  for (const ability of choices?.[grant.key] ?? []) {
    const candidate = ability as Ability;
    if (spent >= grant.points || !eligible.includes(candidate) || bonuses[candidate] >= 2) continue;
    bonuses[candidate] += 1;
    spent += 1;
  }
  return bonuses;
}
