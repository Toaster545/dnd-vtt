import { describe, expect, it } from 'vitest';
import type { AbilityScores } from '../models/character.model';
import type { DndClass, DndFeat, DndRace, DndSpell, SpellcastingDefinition, TraitGrant } from '../services/content.service';
import {
  describeSpellUpcast, isSpellAttack, isSpellAttackAction, resolveSpellAttackDamage,
  resolveSpellAttackNote, resolveSpellcasting as resolveSpellcastingImpl,
} from './spellcasting';
import type { SpellcastingResolverInput } from './spellcasting';

const scores: AbilityScores = {
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 16,
  wisdom: 14,
  charisma: 14,
};

const testSpellLists: Record<string, string[]> = {};

function spell(index: string, name: string, level: number, school: string, lists: string[]): DndSpell {
  for (const list of lists) (testSpellLists[list] ??= []).push(index);
  return { index, name, level, school, casting_time: '1 action', access: [] } as unknown as DndSpell;
}

function resolveSpellcasting(input: Omit<SpellcastingResolverInput, 'spellLists'>) {
  return resolveSpellcastingImpl({ ...input, spellLists: testSpellLists });
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

type TestSpellcastingDefinition = Omit<SpellcastingDefinition, 'spells'> & { spells?: string[] };

function classContent(
  index: string,
  name: string,
  spellcasting: TestSpellcastingDefinition,
  level: number,
  levelFields: Record<string, unknown>,
  grants: TraitGrant[] = [],
): DndClass {
  return {
    index,
    name,
    spellcasting: {
      ...spellcasting,
      spells: spellcasting.spells ?? testSpellLists[spellcasting.list] ?? [],
    },
    levels: [{ level, proficiency_bonus: 2, features: [], grants, ...levelFields }],
    subclasses: [],
  } as unknown as DndClass;
}

const wizardDefinition: TestSpellcastingDefinition = {
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

  it('adds a selected subclass spell-list expansion to its class source', () => {
    const sorcerer = classContent('sorcerer', 'Sorcerer', {
      key: 'class:sorcerer', list: 'Sorcerer', ability: 'charisma',
      mode: 'known', progression: 'full',
    }, 3, {
      spells_known: 1,
      spell_slots: { '1': 4, '2': 2 },
    });
    sorcerer.subclasses = [{
      index: 'divine-soul', name: 'Divine Soul',
      levels: [{
        level: 3, features: ['Divine Magic'], grants: [{
          type: 'spell_list_expansion', key: 'divine_magic', name: 'Divine Magic', list: 'Cleric',
        }],
      }],
    }];

    const result = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: sorcerer, level: 3, subclass: 'Divine Soul' }],
      spellChoices: { 'class:sorcerer:known': ['cure-wounds'] },
    });

    const knownRequirement = result.requirements.find(requirement => requirement.kind === 'known');
    expect(knownRequirement?.eligibleSpellIndices).toContain('cure-wounds');
    expect(knownRequirement?.invalidSelectedSpellIndices).toEqual([]);
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
    expect(conflictingCantrips.unavailableSpellSources['minor-illusion']).toBe('Gnome trait');
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

  it('resolves nested feat spell sources with their own list and casting ability', () => {
    const feat = {
      index: 'magic-initiate', name: 'Magic Initiate', category: 'origin', description: '',
      grants: [{
        type: 'choice', key: 'magic_initiate_list', name: 'Spell List', choose: 1,
        options: [{ name: 'Wizard', grants: [
          {
            type: 'spell_grant', key: 'initiate_cantrips', name: 'Magic Initiate Cantrips',
            destination: 'known', choose: 2, countsAgainstLimit: false,
            ability: { choiceKey: 'magic_initiate_ability' }, filter: { lists: ['Wizard'], exactLevels: [0] },
          },
          {
            type: 'spell_grant', key: 'initiate_spell', name: 'Magic Initiate Spell',
            destination: 'always_prepared', choose: 1, countsAgainstLimit: false,
            ability: { choiceKey: 'magic_initiate_ability' }, filter: { lists: ['Wizard'], exactLevels: [1] },
          },
        ] }],
      }],
    } as DndFeat;
    const initial = resolveSpellcasting({
      characterLevel: 1, abilityScores: scores, spells, classes: [],
      feats: [{
        feat, scope: 'background:sage',
        choices: { magic_initiate_list: ['Wizard'], magic_initiate_ability: ['Charisma'] },
      }],
    });
    expect(initial.requirements.map(requirement => [requirement.name, requirement.required])).toEqual([
      ['Magic Initiate Cantrips', 2], ['Magic Initiate Spell', 1],
    ]);
    expect(initial.sources[0]).toMatchObject({ origin: 'feat', castingAbility: 'charisma' });

    const choices = Object.fromEntries(initial.requirements.map(requirement => [
      requirement.key,
      requirement.name.endsWith('Cantrips') ? ['minor-illusion', 'acid-splash'] : ['magic-missile'],
    ]));
    const complete = resolveSpellcasting({
      characterLevel: 1, abilityScores: scores, spells, classes: [],
      feats: [{
        feat, scope: 'background:sage',
        choices: { magic_initiate_list: ['Wizard'], magic_initiate_ability: ['Charisma'] },
      }],
      spellChoices: choices,
    });
    expect(complete.known.map(entry => entry.spellIndex)).toEqual(['minor-illusion', 'acid-splash']);
    expect(complete.alwaysPrepared.map(entry => entry.spellIndex)).toEqual(['magic-missile']);
    expect(complete.isComplete).toBe(true);
  });

  it('gates subclass spells by class level rather than total character level', () => {
    const paladin = classContent('paladin', 'Paladin', {
      key: 'class:paladin', list: 'Paladin', ability: 'charisma', mode: 'prepared', progression: 'half',
    }, 3, { prepared_spells: 0, spell_slots: { '1': 3 } });
    paladin.subclasses = [{
      index: 'devotion', name: 'Oath of Devotion', levels: [{ level: 3, features: [], grants: [{
        type: 'spell_grant', key: 'devotion_5', name: 'Oath Spells', destination: 'always_prepared',
        spells: ['aid'], countsAgainstLimit: false, classLevel: 5,
      }] }],
    }];

    const result = resolveSpellcasting({
      characterLevel: 10,
      abilityScores: scores,
      spells: [...spells, spell('aid', 'Aid', 2, 'Abjuration', ['Cleric', 'Paladin'])],
      classes: [{ cls: paladin, level: 3, subclass: 'Oath of Devotion' }],
    });
    expect(result.alwaysPrepared).toEqual([]);
  });

  it('limits dependent feature choices to spells already acquired in the spellbook', () => {
    const mastery: TraitGrant = {
      type: 'spell_grant', key: 'spell_mastery_1', name: 'Spell Mastery',
      destination: 'always_prepared', choose: 1, countsAgainstLimit: false,
      fromDestination: 'spellbook', filter: { exactLevels: [1] },
    };
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 18, {
      spells_known: 2, prepared_spells: 0, spell_slots: { '1': 4, '2': 3, '3': 3 },
    }, [mastery]);
    const baseChoices = { 'class:wizard:spellbook': ['magic-missile', 'detect-magic'] };
    const first = resolveSpellcasting({
      characterLevel: 18, abilityScores: scores, spells,
      classes: [{ cls: wizard, level: 18 }], spellChoices: baseChoices,
    });
    const requirement = first.requirements.find(candidate => candidate.name === 'Spell Mastery')!;
    expect(requirement.eligibleSpellIndices).toEqual(['magic-missile', 'detect-magic']);

    const complete = resolveSpellcasting({
      characterLevel: 18, abilityScores: scores, spells,
      classes: [{ cls: wizard, level: 18 }],
      spellChoices: { ...baseChoices, [requirement.key]: ['detect-magic'] },
    });
    expect(complete.alwaysPrepared).toContainEqual(expect.objectContaining({
      spellIndex: 'detect-magic', sourceName: 'Wizard',
    }));
  });

  it('matches Action grants exactly without admitting Bonus Action spells', () => {
    const mastery: TraitGrant = {
      type: 'spell_grant', key: 'spell_mastery_1', name: 'Spell Mastery',
      destination: 'always_prepared', choose: 1, countsAgainstLimit: false,
      fromDestination: 'spellbook', filter: { exactLevels: [1], castingTimes: ['action'] },
    };
    const wizard = classContent('wizard', 'Wizard', wizardDefinition, 18, {
      spells_known: 2, prepared_spells: 0, spell_slots: { '1': 4 },
    }, [mastery]);
    const timedSpells = [
      { ...spell('action-spell', 'Action Spell', 1, 'Evocation', ['Wizard']), casting_time: '1 action' },
      { ...spell('bonus-spell', 'Bonus Spell', 1, 'Evocation', ['Wizard']), casting_time: '1 bonus action' },
    ] as DndSpell[];
    const result = resolveSpellcasting({
      characterLevel: 18, abilityScores: scores, spells: timedSpells,
      classes: [{ cls: wizard, level: 18 }],
      spellChoices: { 'class:wizard:spellbook': ['action-spell', 'bonus-spell'] },
    });

    expect(result.requirements.find(candidate => candidate.name === 'Spell Mastery')?.eligibleSpellIndices)
      .toEqual(['action-spell']);
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
    expect(duplicate.requirements[0].eligibleSpellIndices).toContain('shield-of-faith');
    expect(duplicate.requirements[0].unavailableSpellIndices).toContain('shield-of-faith');
    expect(duplicate.requirements[0].unavailableSpellSources['shield-of-faith']).toBe('Devotion Spells');
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

  it('keeps subclass-granted class spells visible and identifies the subclass provider', () => {
    const artificer = classContent('artificer', 'Artificer', {
      key: 'class:artificer', list: 'Wizard', spells: ['magic-missile', 'burning-hands'],
      ability: 'intelligence', mode: 'prepared', progression: 'half',
    }, 3, { prepared_spells: 1, spell_slots: { '1': 3 } });
    artificer.subclasses = [{
      index: 'cartographer',
      name: 'Cartographer',
      levels: [{
        level: 3,
        features: [],
        grants: [{
          type: 'spell_grant', key: 'cartographer-spells', name: 'Cartographer Spells',
          destination: 'always_prepared', spells: ['magic-missile'], countsAgainstLimit: false,
        }],
      }],
    }] as DndClass['subclasses'];

    const result = resolveSpellcasting({
      characterLevel: 3,
      abilityScores: scores,
      spells,
      classes: [{ cls: artificer, level: 3, subclass: 'Cartographer' }],
    });
    const prepared = result.requirements.find(requirement => requirement.kind === 'prepared')!;

    expect(prepared.eligibleSpellIndices).toContain('magic-missile');
    expect(prepared.unavailableSpellIndices).toContain('magic-missile');
    expect(prepared.unavailableSpellSources['magic-missile']).toBe('Cartographer');
    expect(result.alwaysPrepared).toContainEqual(expect.objectContaining({
      spellIndex: 'magic-missile',
      providedBy: 'Cartographer',
    }));
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

  it('exposes data-driven free casts on each granted spell origin', () => {
    const race = {
      index: 'gnome',
      name: 'Gnome',
      grants: [{
        type: 'spell_grant',
        key: 'forest_magic',
        name: 'Forest Gnome Magic',
        destination: 'always_prepared',
        spells: ['speak-with-animals'],
        countsAgainstLimit: false,
        sourceKey: 'forest-gnome',
        sourceName: 'Forest Gnome',
        ability: 'wisdom',
        freeCast: { uses: 'proficiency_bonus', recovery: 'long_rest' },
      }],
      traits: [], subraces: [], languages: [],
    } as unknown as DndRace;
    const result = resolveSpellcasting({
      characterLevel: 5,
      abilityScores: scores,
      spells,
      classes: [],
      race: { race },
    });

    expect(result.alwaysPrepared[0]).toMatchObject({
      spellIndex: 'speak-with-animals',
      freeCast: {
        maxUses: 3,
        recovery: 'long_rest',
        atWill: false,
      },
    });
    expect(result.alwaysPrepared[0].freeCast?.key).toContain('forest_magic');
  });

  it('creates a scaling Dragonmark-only slot for Potent Dragonmark', () => {
    const mark = {
      index: 'mark-of-making',
      name: 'Mark of Making',
      category: 'origin',
      tags: ['dragonmark'],
      grants: [
        {
          type: 'spell_grant', key: 'mark-spell', name: 'Mark Spell',
          destination: 'always_prepared', spells: ['magic-missile'],
        },
        {
          type: 'spell_list_expansion', key: 'mark-list', name: 'Spells of the Mark',
          spells: ['fireball'], alwaysPreparedIfFeat: 'potent-dragonmark',
        },
      ],
    } as unknown as DndFeat;
    const potent = {
      index: 'potent-dragonmark',
      name: 'Potent Dragonmark',
      category: 'general',
      grants: [{
        type: 'dragonmark_slot', key: 'potent_dragonmark_slot',
        name: 'Dragonmark Spell Slot', maxLevel: 5, recovery: 'short_rest',
      }],
    } as unknown as DndFeat;

    const result = resolveSpellcasting({
      characterLevel: 9,
      abilityScores: scores,
      spells,
      classes: [],
      feats: [
        { feat: mark, scope: 'background:mark' },
        { feat: potent, scope: 'class:wizard:asi_8' },
      ],
    });

    expect(result.slotPools).toContainEqual({
      key: 'restricted:potent_dragonmark_slot',
      name: 'Dragonmark Spell Slot',
      type: 'restricted',
      slots: { '5': 1 },
      allowedSpellIndices: expect.arrayContaining(['magic-missile', 'fireball']),
      recovery: 'short_rest',
    });
  });
});

describe('describeSpellUpcast', () => {
  it('calculates Scorching Ray totals for each higher slot', () => {
    const scorchingRay = {
      index: 'scorching-ray', level: 2,
      higher_levels: 'You create one additional ray for each spell slot level above 2.',
    } as DndSpell;

    expect(describeSpellUpcast(scorchingRay, 3)).toMatchObject({
      levelsAbove: 1,
      summary: 'Creates 4 rays total (+1).',
    });
    expect(describeSpellUpcast(scorchingRay, 5)?.summary)
      .toBe('Creates 6 rays total (+3).');
  });

  it('summarizes dice scaling and rejects slots with no upcast benefit', () => {
    const fireball = {
      index: 'fireball', level: 3,
      higher_levels: 'The damage increases by 1d6 for each spell slot level above 3.',
    } as DndSpell;
    const detectMagic = { index: 'detect-magic', level: 1 } as DndSpell;

    expect(describeSpellUpcast(fireball, 5)?.summary).toBe('Adds 2d6 damage.');
    expect(describeSpellUpcast(detectMagic, 2)).toBeNull();
  });
});

describe('spell action summaries', () => {
  it('shows Eldritch Blast attack damage, Agonizing Blast modifier, and beam scaling', () => {
    const eldritchBlast = {
      index: 'eldritch-blast',
      description: 'Make a ranged spell attack. On a hit, the target takes 1d10 Force damage.',
      mechanics: { spell_attacks: ['ranged'], damage_types: ['force'] },
    } as DndSpell;

    expect(isSpellAttack(eldritchBlast)).toBe(true);
    expect(resolveSpellAttackDamage(eldritchBlast, 3, 4)).toBe('1d10+4');
    expect(resolveSpellAttackNote(eldritchBlast, 3)).toBe('1 beam');
    expect(resolveSpellAttackNote(eldritchBlast, 11)).toBe('3 beams · separate attack for each');
  });

  it('uses cantrip scaling and excludes non-attack spells', () => {
    const fireBolt = {
      index: 'fire-bolt',
      description: 'On a hit, the target takes 1d10 Fire damage.',
      mechanics: {
        spell_attacks: ['ranged'], damage_types: ['fire'],
        scaling: { label: 'Fire damage', values: { '1': '1d10', '5': '2d10', '11': '3d10', '17': '4d10' } },
      },
    } as unknown as DndSpell;
    const minorIllusion = {
      index: 'minor-illusion', description: 'Create a sound or image.',
      mechanics: { spell_attacks: [], damage_types: [] },
    } as unknown as DndSpell;

    expect(resolveSpellAttackDamage(fireBolt, 5)).toBe('2d10');
    expect(isSpellAttack(minorIllusion)).toBe(false);
  });

  it('only puts attack rolls and no-save rolled damage in Actions', () => {
    const attackRoll = {
      index: 'poison-spray',
      description: 'Make a ranged spell attack. On a hit, the target takes 1d12 Poison damage.',
      mechanics: { spell_attacks: ['ranged'], saving_throws: [], damage_types: ['poison'] },
    } as unknown as DndSpell;
    const saveDamage = {
      index: 'dissonant-whispers',
      description: 'The target takes 3d6 Psychic damage on a failed save.',
      mechanics: { spell_attacks: [], saving_throws: ['wisdom'], damage_types: ['psychic'] },
    } as unknown as DndSpell;
    const noSaveDamage = {
      index: 'magic-missile',
      description: 'Each dart deals 1d4 + 1 Force damage.',
      mechanics: { spell_attacks: [], saving_throws: [], damage_types: ['force'] },
    } as unknown as DndSpell;
    const utility = {
      index: 'detect-magic',
      description: 'You sense the presence of magical effects.',
      mechanics: { spell_attacks: [], saving_throws: [], damage_types: [] },
    } as unknown as DndSpell;

    expect(isSpellAttackAction(attackRoll)).toBe(true);
    expect(isSpellAttackAction(saveDamage)).toBe(false);
    expect(isSpellAttackAction(noSaveDamage)).toBe(true);
    expect(isSpellAttackAction(utility)).toBe(false);
  });
});
