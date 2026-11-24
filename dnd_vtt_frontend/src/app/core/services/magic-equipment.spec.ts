import { describe, expect, it } from 'vitest';
import { defaultCharacter, EquipmentEntry } from '../models/character.model';
import { DndClass, DndItem, DndRace } from './content.service';
import { CharacterStatsService } from './character-stats.service';
import { CharacterActionsService } from './character-actions.service';
import artificerContent from '../../../../../dnd_vtt_backend/content/classes/artificer.json';
import gogglesContent from '../../../../../dnd_vtt_backend/content/items/goggles-of-night.json';
import wrapsContent from '../../../../../dnd_vtt_backend/content/items/wraps-of-unarmed-power-plus-1.json';
import wandContent from '../../../../../dnd_vtt_backend/content/items/wand-of-the-war-mage-plus-1.json';
import shieldContent from '../../../../../dnd_vtt_backend/content/items/shield-plus-1.json';

const artificer = artificerContent as unknown as DndClass;
const dagger: DndItem = {
  index: 'returning-weapon',
  name: 'Returning Dagger',
  type: 'weapon',
  category: 'Simple Melee',
  damage: '1d4',
  damage_type: 'piercing',
  properties: ['Finesse', 'Thrown (20/60)'],
  enhancement_bonus: 1,
  rarity: 'uncommon',
  weight: 1,
  cost: '',
  description: '',
};
const entry = (item: DndItem, instanceId: string, attuned = false): EquipmentEntry => ({
  instanceId,
  itemIndex: item.index,
  name: item.name,
  quantity: 1,
  equipped: true,
  attuned,
  resolvedItem: item,
});
const stats = (equipment: EquipmentEntry[]) =>
  new CharacterStatsService().compute(
    {
      ...defaultCharacter(),
      name: 'Alberto',
      class: 'Artificer',
      level: 3,
      ability_scores: {
        strength: 6,
        dexterity: 16,
        constitution: 14,
        intelligence: 18,
        wisdom: 12,
        charisma: 10,
      },
      equipment,
    },
    artificer,
    { darkvision_ft: 60 } as DndRace,
    [],
    [{ data: artificer, level: 3, subclass: 'Battle Smith', choices: {} }],
    [],
  );

describe('resolved magic equipment', () => {
  it('uses resolved instance statistics even when a catalog entry is a generic template', () => {
    expect(stats([entry(dagger, 'returning')]).weapon_attacks[0]).toMatchObject({
      instanceId: 'returning',
      name: 'Returning Dagger +1',
      attack_bonus: 7,
      damage_dice: '1d4',
      damage_bonus: 5,
    });
  });
  it('keeps attunement isolated between copies and uses Intelligence independently of item enhancement', () => {
    const weapon = { ...dagger, requires_attunement: true };
    const result = stats([entry(weapon, 'first', true), entry(weapon, 'second')]);
    expect(
      result.weapon_attacks.map((w) => [w.instanceId, w.attack_bonus, w.damage_bonus]),
    ).toEqual([
      ['first', 7, 5],
      ['second', 6, 4],
    ]);
  });
  it('applies shield, senses, spell and unarmed effects to their own statistics', () => {
    const result = stats([
      entry(gogglesContent as DndItem, 'eyes'),
      entry(shieldContent as DndItem, 'shield'),
      entry(wrapsContent as DndItem, 'wraps'),
      entry(wandContent as DndItem, 'wand', true),
    ]);
    expect(result.computed_ac).toBe(16);
    expect(result.darkvision_ft).toBe(120);
    expect(result.spell_attack_bonus).toBe(7);
    expect(result.spell_save_dc).toBe(14);
    expect(result.unarmed_attack.attack_bonus).toBe(1);
    expect(result.unarmed_attack.damage_bonus).toBe(-1);
    expect(result.weapon_attacks).toHaveLength(0);
  });
  it('does not stack duplicate copies of the same effect and ignores unresolved replicas', () => {
    expect(
      stats([entry(gogglesContent as DndItem, 'one'), entry(gogglesContent as DndItem, 'two')])
        .darkvision_ft,
    ).toBe(120);
    expect(stats([{ ...entry(dagger, 'legacy'), needsBase: true }]).weapon_attacks).toHaveLength(0);
  });
  it('exposes independent item action resources without sharing class counters', () => {
    const wand: DndItem = {
      ...dagger,
      type: 'magic',
      charges: { max: 3, recovery: 'dawn' },
      actions: [{ key: 'activate', name: 'Detect', activation: 'action' }],
    };
    const actions = new CharacterActionsService().compute([], {}, undefined, {
      characterLevel: 3,
      items: [
        { ...wand, instanceId: 'first', chargesUsed: 2 },
        { ...wand, instanceId: 'second', chargesUsed: 0 },
      ],
    });
    expect(actions.map((a) => [a.itemInstanceId, a.usedUses])).toEqual([
      ['first', 2],
      ['second', 0],
    ]);
    expect(actions[0].key).not.toBe(actions[1].key);
    expect(actions[0].description).toContain('dawn');
  });
});
