import { DndItem } from '../services/content.service';

// Class weapon proficiencies use book-facing labels rather than item-category ids. Keep the
// translation in one place so attack bonuses and Weapon Mastery choices enforce the same rules.
export function weaponMatchesProficiency(weapon: DndItem, proficiency: string): boolean {
  const normalized = proficiency.toLowerCase();
  const isSimple = weapon.category.startsWith('Simple');
  const isMartial = weapon.category.startsWith('Martial');

  if (normalized === 'simple' || normalized === 'simple weapons') {
    return isSimple;
  }
  if (normalized === 'martial' || normalized === 'martial weapons') {
    return isMartial;
  }
  if (normalized === 'simple melee' || normalized === 'martial melee'
    || normalized === 'simple ranged' || normalized === 'martial ranged') {
    return weapon.category.toLowerCase() === normalized;
  }
  if (normalized === 'martial weapons with the light property') {
    return isMartial && weapon.properties.includes('Light');
  }
  if (normalized === 'martial weapons with the finesse or light property') {
    return (
      isMartial && (weapon.properties.includes('Finesse') || weapon.properties.includes('Light'))
    );
  }

  return proficiency.replace(/s$/, '').toLowerCase() === weapon.name.toLowerCase();
}

export function weaponMatchesAnyProficiency(weapon: DndItem, proficiencies: string[]): boolean {
  return proficiencies.some((proficiency) => weaponMatchesProficiency(weapon, proficiency));
}
