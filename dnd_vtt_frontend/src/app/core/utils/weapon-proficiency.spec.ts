import { describe, expect, it } from 'vitest';
import { DndItem } from '../services/content.service';
import { weaponMatchesAnyProficiency } from './weapon-proficiency';

const weapon = (name: string, category: string, properties: string[]): DndItem =>
  ({
    index: name.toLowerCase(),
    name,
    type: 'weapon',
    category,
    damage: '1d6',
    damage_type: 'Piercing',
    properties,
    weight: 1,
    cost: '1 GP',
    description: '',
  }) as DndItem;

describe('weapon proficiency matching', () => {
  it('allows only Finesse or Light martial weapons for a Rogue', () => {
    const rogueProficiencies = [
      'Simple Weapons',
      'Martial Weapons with the Finesse or Light property',
    ];

    expect(
      weaponMatchesAnyProficiency(
        weapon('Rapier', 'Martial Melee', ['Finesse']),
        rogueProficiencies,
      ),
    ).toBe(true);
    expect(
      weaponMatchesAnyProficiency(
        weapon('Scimitar', 'Martial Melee', ['Light']),
        rogueProficiencies,
      ),
    ).toBe(true);
    expect(
      weaponMatchesAnyProficiency(
        weapon('Longbow', 'Martial Ranged', ['Heavy', 'Two-Handed']),
        rogueProficiencies,
      ),
    ).toBe(false);
    expect(
      weaponMatchesAnyProficiency(
        weapon('Dagger', 'Simple Melee', ['Finesse', 'Light']),
        rogueProficiencies,
      ),
    ).toBe(true);
  });
});
