import { SKILLS } from '../models/character.model';

export const BACKGROUND_SKILLS_KEY = 'background_skills';

export function resolveBackgroundSkills(
  background: { skill_proficiencies: string[] } | null,
  choices: Record<string, string[]> | null | undefined,
): string[] {
  const customized = choices?.[BACKGROUND_SKILLS_KEY];
  if (
    customized?.length === 2
    && new Set(customized).size === 2
    && customized.every(skill => Object.hasOwn(SKILLS, skill))
  ) {
    return customized;
  }
  return background?.skill_proficiencies ?? [];
}
