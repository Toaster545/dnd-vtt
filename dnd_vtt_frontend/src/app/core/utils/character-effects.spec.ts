import { describe, expect, it } from 'vitest';
import { EquipmentEntry } from '../models/character.model';
import { DndItem, TraitEffect } from '../services/content.service';
import {
  evaluateCondition,
  resolveLanguageProficiencies,
  unarmoredDefenseBonus,
} from './character-effects';

describe('unarmoredDefenseBonus', () => {
  it('adds the modifier named by an active Unarmored Defense effect', () => {
    const effects: TraitEffect[] = [
      { type: 'unarmored_defense', tags: ['constitution'], condition: 'no_armor' },
    ];
    expect(unarmoredDefenseBonus(effects, { constitution: 3 })).toBe(3);
  });

  it('preserves a negative modifier because the feature uses the real modifier', () => {
    const effects: TraitEffect[] = [
      { type: 'unarmored_defense', tags: ['constitution'], condition: 'no_armor' },
    ];
    expect(unarmoredDefenseBonus(effects, { constitution: -1 })).toBe(-1);
  });

  it('adds nothing without an active Unarmored Defense effect', () => {
    expect(unarmoredDefenseBonus([], { constitution: 4 })).toBe(0);
  });
});

describe('no_armor_or_shield equipment condition', () => {
  const leather = {
    index: 'leather-armor', type: 'armor', category: 'Light Armor', properties: [],
  } as DndItem;
  const shield = {
    index: 'shield', type: 'armor', category: 'Shield', properties: [],
  } as DndItem;
  const equipped = (itemIndex: string): EquipmentEntry[] => [
    { itemIndex, name: itemIndex, quantity: 1, equipped: true },
  ];

  it('is active only while neither armor nor a shield is equipped', () => {
    expect(evaluateCondition('no_armor_or_shield', [], [leather, shield])).toBe(true);
    expect(evaluateCondition('no_armor_or_shield', equipped(leather.index), [leather, shield])).toBe(false);
    expect(evaluateCondition('no_armor_or_shield', equipped(shield.index), [leather, shield])).toBe(false);
  });
});

describe('resolveLanguageProficiencies', () => {
  it('combines race and class languages while keeping Common exactly once', () => {
    const effects: TraitEffect[] = [
      { type: 'language_proficiency', tags: ['Sylvan'] },
      { type: 'language_proficiency', tags: ['Elvish'] },
    ];

    expect(resolveLanguageProficiencies(['Elvish', 'Dwarvish'], effects)).toEqual([
      'Common',
      'Elvish',
      'Dwarvish',
      'Sylvan',
    ]);
  });
});
