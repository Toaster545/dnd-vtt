import { describe, expect, it } from 'vitest';
import type { AbilityScores } from '../models/character.model';
import type { DndClass, DndRace, DndSpell, SpellcastingDefinition, TraitGrant } from '../services/content.service';
import { resolveSpellcasting } from './spellcasting';

const scores: AbilityScores = {
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 16,
  wisdom: 14,
  charisma: 14,
};

function spell(index: string, name: string, level: number, school: string, classes: string[]): DndSpell {
  return { index, name, level, school, classes } as DndSpell;
}

const spells = [
  spell('minor-illusion', 'Minor Illusion', 0, 'Illusion', ['Bard', 'Sorcerer', 'Warlock', 'Wizard']),
  spell('acid-splash', 'Acid Splash', 0, 'Evocation', ['Sorcerer', 'Wizard']),
  spell('magic-missile', 'Magic Missile', 1, 'Evocation', ['Sorcerer', 'Wizard']),
  spell('burning-hands', 'Burning Hands', 1, 'Evocation', ['Sorcerer', 'Wizard']),
  spell('detect-magic', 'Detect Magic', 1, 'Divination', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard']),
  spell('speak-with-animals', 'Speak with Animals', 1, 'Divination', ['Bard', 'Druid', 'Ranger', 'Warlock']),
  spell('shield-of-faith', 'Shield of Faith', 1, 'Abjuration', ['Cleric', 'Paladin']),
  spell('scorching-ray', 'Scorching Ray', 2, 'Evocation', ['Sorcerer', 'Wizard']),
  spell('shatter', 'Shatter', 2, 'Evocation', ['Bard', 'Sorcerer', 'Warlock', 'Wizard']),
  spell('fireball', 'Fireball', 3, 'Evocation', ['Sorcerer', 'Wizard']),
  spell('cure-wounds', 'Cure Wounds', 1, 'Evocation', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger']),
];

function classContent(
  index: string,
  name: string,
  spellcasting: SpellcastingDefinition,
  level: number,
  levelFields: Record<string, unknown>,
  grants: TraitGrant[] = [],
): DndClass {
  return {
    index,
    name,
    spellcasting,
    levels: [{ level, proficiency_bonus: 2, features: [], grants, ...levelFields }],
    subclasses: [],
  } as unknown as DndClass;
}

const wizardDefinition: SpellcastingDefinition = {
  key: 'class:wizard',
  list: 'Wizard',
  ability: 'intelligence',
  mode: 'spellbook',
  progression: 'full',
};

describe('resolveSpellcasting', () => {
  it('marks a non-spellcaster with no grants complete', () => {
    const result = resolveSpellcasting({
      characterLevel: 1,
      abilityScores: scores,
      spells,
      classes: [],
    });

    expect(result.sources).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.isComplete).toBe(true);
  });

  it('returns source limits, eligible choices, stats, and repairable validation errors', () => {
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 3, {
      cantrips_known: 1,
      spells_known: 2,
      prepared_spells: 1,
      spell_slots: { '1': 4, '2': 2 },
    });
    const result = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: wizard, level: 3 }],
      spellChoices: {
        'class:wizard:cantrips': ['minor-illusion'],
        'class:wizard:spellbook': ['magic-missile', 'fireball'],
        'class:wizard:prepared': ['magic-missile'],
      },
    });

    expect(result.sources[0]).toMatchObject({
      key: 'class:wizard',
      maxSpellLevel: 2,
      castingAbility: 'intelligence',
      spellAttackBonus: 5,
      spellSaveDc: 13,
    });
    expect(result.requirements.map((requirement) => [requirement.kind, requirement.required])).toEqual([
      ['cantrips', 1],
      ['spellbook', 2],
      ['prepared', 1],
    ]);
    expect(result.requirements[1].selectedSpellIndices).toContain('fireball');
    expect(result.requirements[1].invalidSelectedSpellIndices).toEqual(['fireball']);
    expect(result.requirements[1].remaining).toBe(1);
    expect(result.validationErrors).toContainEqual(expect.objectContaining({
      code: 'ineligible_spell',
      spellIndex: 'fireball',
    }));
    expect(result.isComplete).toBe(false);
  });

  it('resolves complete Wizard spellbook and preparation selections', () => {
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 3, {
      cantrips_known: 1,
      spells_known: 2,
      prepared_spells: 1,
      spell_slots: { '1': 4, '2': 2 },
    });
    const result = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: wizard, level: 3 }],
      spellChoices: {
        'class:wizard:cantrips': ['minor-illusion'],
        'class:wizard:spellbook': ['magic-missile', 'detect-magic'],
        'class:wizard:prepared': ['magic-missile'],
      },
    });

    expect(result.isComplete).toBe(true);
    expect(result.known.map((entry) => entry.spellIndex)).toEqual(['minor-illusion']);
    expect(result.spellbook.map((entry) => entry.spellIndex)).toEqual(['magic-missile', 'detect-magic']);
    expect(result.prepared.map((entry) => entry.spellIndex)).toEqual(['magic-missile']);
    expect(result.slotPools).toEqual([
      { key: 'spellcasting', name: 'Spell Slots', type: 'normal', slots: { '1': 4, '2': 2 } },
    ]);
  });

  it('activates option grants and resolves a choice-based racial casting ability', () => {
    const forestGrants: TraitGrant[] = [
      {
        type: 'spell_grant', key: 'minor', name: 'Forest Magic', destination: 'known',
        spells: ['minor-illusion'], sourceKey: 'forest-gnome', sourceName: 'Forest Gnome',
        ability: { choiceKey: 'gnomish_spellcasting_ability' },
      },
      {
        type: 'spell_grant', key: 'animals', name: 'Forest Magic', destination: 'always_prepared',
        spells: ['speak-with-animals'], sourceKey: 'forest-gnome', sourceName: 'Forest Gnome',
        ability: { choiceKey: 'gnomish_spellcasting_ability' },
      },
    ];
    const race = {
      index: 'gnome', name: 'Gnome', subraces: [], grants: [{
        type: 'choice', key: 'lineage', name: 'Lineage', choose: 1,
        options: [{ name: 'Forest Gnome', grants: forestGrants }, { name: 'Rock Gnome' }],
      }],
    } as unknown as DndRace;
    const result = resolveSpellcasting({
      characterLevel: 1,
      abilityScores: scores,
      spells,
      classes: [],
      race: { race, choices: { lineage: ['Forest Gnome'], gnomish_spellcasting_ability: ['Wisdom'] } },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      name: 'Forest Gnome', castingAbility: 'wisdom', spellAttackBonus: 4, spellSaveDc: 12,
    });
    expect(result.known.map((entry) => entry.spellIndex)).toEqual(['minor-illusion']);
    expect(result.alwaysPrepared.map((entry) => entry.spellIndex)).toEqual(['speak-with-animals']);
    expect(result.isComplete).toBe(true);
  });

  it('prevents selecting a spell already granted by another source and reports existing conflicts', () => {
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 1, {
      cantrips_known: 1,
      spell_slots: { '1': 2 },
    });
    const race = {
      index: 'gnome', name: 'Gnome', subraces: [], grants: [{
        type: 'spell_grant', key: 'forest-magic', name: 'Forest Gnome Magic', destination: 'known',
        spells: ['minor-illusion'], ability: 'intelligence',
      }],
    } as unknown as DndRace;

    const conflict = resolveSpellcasting({
      characterLevel: 1,
      abilityScores: scores,
      spells,
      classes: [{ cls: wizard, level: 1 }],
      race: { race },
      spellChoices: { 'class:wizard:cantrips': ['minor-illusion'] },
    });
    const conflictingCantrips = conflict.requirements.find(requirement => requirement.kind === 'cantrips')!;
    expect(conflictingCantrips.invalidSelectedSpellIndices).toContain('minor-illusion');
    expect(conflictingCantrips.unavailableSpellIndices).toContain('minor-illusion');
    expect(conflictingCantrips.unavailableSpellSources['minor-illusion']).toBe('Forest Gnome Magic');
    expect(conflict.validationErrors).toContainEqual(expect.objectContaining({
      code: 'duplicate_spell', spellIndex: 'minor-illusion',
    }));

    const repaired = resolveSpellcasting({
      characterLevel: 1,
      abilityScores: scores,
      spells,
      classes: [{ cls: wizard, level: 1 }],
      race: { race },
      spellChoices: { 'class:wizard:cantrips': ['acid-splash'] },
    });
    const repairedCantrips = repaired.requirements.find(requirement => requirement.kind === 'cantrips')!;
    expect(repairedCantrips.validSelectedSpellIndices).toEqual(['acid-splash']);
    expect(repairedCantrips.unavailableSpellIndices).toContain('minor-illusion');
    expect(repaired.isComplete).toBe(true);
  });

  it('enforces school/list/level filters for bonus spells without consuming normal limits', () => {
    const evocationGrant: TraitGrant = {
      type: 'spell_grant', key: 'evocation_savant_3', name: 'Evocation Savant',
      destination: 'spellbook', choose: 2, countsAgainstLimit: false,
      filter: { lists: ['Wizard'], schools: ['Evocation'], minLevel: 1, maxLevel: 2 },
    };
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 3, {
      cantrips_known: 0,
      spells_known: 1,
      prepared_spells: 0,
      spell_slots: { '1': 4, '2': 2 },
    });
    wizard.subclasses = [{
      index: 'evoker', name: 'Evoker', levels: [{ level: 3, features: [], grants: [evocationGrant] }],
    }];
    const result = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: wizard, level: 3, subclass: 'Evoker' }],
      spellChoices: {
        'class:wizard:spellbook': ['detect-magic'],
        'class:wizard:subclass:evoker:level:3:grant:evocation_savant_3': ['burning-hands', 'scorching-ray'],
      },
    });
    const savant = result.requirements.find((requirement) => requirement.kind === 'bonus')!;

    expect(savant.required).toBe(2);
    expect(savant.subclassName).toBe('Evoker');
    expect(savant.eligibleSpellIndices).toEqual(expect.arrayContaining([
      'magic-missile', 'burning-hands', 'scorching-ray', 'shatter',
    ]));
    expect(savant.eligibleSpellIndices).not.toContain('fireball');
    expect(savant.eligibleSpellIndices).not.toContain('cure-wounds');
    expect(result.spellbook).toHaveLength(3);
    expect(result.isComplete).toBe(true);
  });

  it('keeps always-prepared spells outside the limit and rejects preparing them twice', () => {
    const alwaysPrepared: TraitGrant = {
      type: 'spell_grant', key: 'devotion-spells', name: 'Devotion Spells',
      destination: 'always_prepared', spells: ['shield-of-faith'], countsAgainstLimit: false,
    };
    const paladin = classContent('paladin', 'Paladin', {
      key: 'class:paladin', list: 'Paladin', ability: 'charisma', mode: 'prepared', progression: 'half',
    }, 3, { prepared_spells: 1, spell_slots: { '1': 3 } }, [alwaysPrepared]);

    const duplicate = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: paladin, level: 3 }],
      spellChoices: { 'class:paladin:prepared': ['shield-of-faith'] },
    });
    expect(duplicate.requirements[0].invalidSelectedSpellIndices).toEqual(['shield-of-faith']);
    expect(duplicate.requirements[0].remaining).toBe(1);

    const valid = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: paladin, level: 3 }],
      spellChoices: { 'class:paladin:prepared': ['cure-wounds'] },
    });
    expect(valid.prepared.map((entry) => entry.spellIndex)).toEqual(['cure-wounds']);
    expect(valid.alwaysPrepared.map((entry) => entry.spellIndex)).toEqual(['shield-of-faith']);
    expect(valid.isComplete).toBe(true);
  });

  it('combines normal multiclass slots and keeps Pact Magic separate', () => {
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 3, {
      spell_slots: { '1': 4, '2': 2 },
    });
    const paladin = classContent('paladin', 'Paladin', {
      key: 'class:paladin', list: 'Paladin', ability: 'charisma', mode: 'prepared', progression: 'half',
    }, 2, { spell_slots: { '1': 2 } });
    const warlock = classContent('warlock', 'Warlock', {
      key: 'class:warlock', list: 'Warlock', ability: 'charisma', mode: 'known', progression: 'pact',
    }, 3, { pact_magic: { slots: 2, slot_level: 2 } });
    const result = resolveSpellcasting({
      characterLevel: 8,
      abilityScores: scores,
      spells,
      classes: [
        { cls: wizard, level: 3 },
        { cls: paladin, level: 2 },
        { cls: warlock, level: 3 },
      ],
    });

    expect(result.slotPools).toEqual([
      { key: 'spellcasting', name: 'Spell Slots', type: 'normal', slots: { '1': 4, '2': 3 } },
      { key: 'pact:class:warlock', name: 'Warlock Pact Magic', type: 'pact', slots: { '2': 2 }, pactSlotLevel: 2 },
    ]);
  });

  it('keeps selections from removed or leveled-down sources visible for repair', () => {
    const result = resolveSpellcasting({
      characterLevel: 1,
      abilityScores: scores,
      spells,
      classes: [],
      spellChoices: { 'class:wizard:spellbook': ['fireball'] },
    });

    expect(result.requirements).toContainEqual(expect.objectContaining({
      key: 'class:wizard:spellbook',
      sourceName: 'Unassigned Spells',
      selectedSpellIndices: ['fireball'],
      invalidSelectedSpellIndices: ['fireball'],
    }));
    expect(result.validationErrors).toContainEqual(expect.objectContaining({
      code: 'ineligible_spell',
      spellIndex: 'fireball',
    }));
    expect(result.isComplete).toBe(false);
  });
});
