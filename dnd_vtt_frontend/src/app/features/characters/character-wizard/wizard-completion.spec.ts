import { describe, expect, it } from 'vitest';
import { DndBackground, DndClass, DndFeat, DndRace } from '../../../core/services/content.service';
import {
  areAbilityAssignmentsComplete,
  areClassSelectionsComplete,
  areStartingEquipmentChoicesComplete,
  isBackgroundSelectionComplete,
  isRaceSelectionComplete,
} from './wizard-completion';

describe('character wizard completion indicators', () => {
  it('keeps Race incomplete until every saved race choice is filled', () => {
    const race = {
      index: 'test-race',
      size_options: ['Small', 'Medium'],
      subraces: [],
      grants: [{ type: 'skill_choice', key: 'skill', name: 'Skill', choose: 1 }],
    } as unknown as DndRace;

    expect(isRaceSelectionComplete(null)).toBe(false);
    expect(isRaceSelectionComplete({
      race,
      subrace: null,
      traits: { languages: ['Elvish'], size: ['Medium'] },
    })).toBe(false);
    expect(isRaceSelectionComplete({
      race,
      subrace: null,
      traits: { languages: ['Elvish', 'Dwarvish'], size: ['Medium'], skill: ['Perception'] },
    })).toBe(true);
  });

  it('checks unlocked class choices, progressive pools, and subclass selection', () => {
    const cls = {
      subclass_level: 3,
      subclasses: [{ index: 'path', name: 'Path', levels: [] }],
      levels: [
        {
          level: 1,
          grants: [
            { type: 'skill_choice', key: 'skills', name: 'Skills', choose: 2 },
            { type: 'expertise_choice', key: 'expertise', name: 'Expertise', choose: 2 },
            {
              type: 'choice', key: 'pool', name: 'Pool', choose: 1,
              chooseByLevel: { '1': 1, '4': 3 }, options: [],
            },
          ],
        },
      ],
    } as unknown as DndClass;

    const entry = {
      cls,
      level: 4,
      subclass: '',
      skills: ['Athletics', 'Survival'],
      traits: { pool: ['One', 'Two', 'Three'], expertise: ['Athletics'] },
    };
    expect(areClassSelectionsComplete([entry], [])).toBe(false);
    expect(areClassSelectionsComplete([{ ...entry, subclass: 'Path' }], [])).toBe(false);
    expect(areClassSelectionsComplete([{
      ...entry,
      subclass: 'Path',
      traits: { ...entry.traits, expertise: ['Athletics', 'Survival'] },
    }], [])).toBe(true);
  });

  it('treats completed weapon masteries as weapon choices rather than feat picks', () => {
    const paladin = {
      index: 'paladin',
      subclass_level: 3,
      subclasses: [{ index: 'vengeance', name: 'Oath of Vengeance', levels: [] }],
      levels: [{
        level: 1,
        grants: [{
          type: 'weapon_mastery', key: 'weapon_mastery', name: 'Weapon Mastery',
          choose: 2, proficiency: ['Simple', 'Martial'],
        }],
      }],
    } as unknown as DndClass;

    expect(areClassSelectionsComplete([{
      cls: paladin,
      level: 3,
      subclass: 'Oath of Vengeance',
      skills: [],
      traits: { weapon_mastery: ['longsword', 'javelin'] },
    }], [])).toBe(true);
  });

  it('checks every background grant and all six ability assignments', () => {
    const background = {
      grants: [
        { type: 'ability_choice', key: 'abilities', name: 'Abilities', points: 3 },
        { type: 'choice', key: 'tool', name: 'Tool', choose: 1, options: [] },
      ],
    } as unknown as DndBackground;
    expect(isBackgroundSelectionComplete({
      background,
      traits: { abilities: ['strength', 'strength'], tool: ['Dice Set'] },
    })).toBe(false);
    expect(isBackgroundSelectionComplete({
      background,
      traits: { abilities: ['strength', 'strength', 'constitution'], tool: ['Dice Set'] },
    })).toBe(true);

    expect(areAbilityAssignmentsComplete({
      strength: 15, dexterity: 14, constitution: 13,
      intelligence: 12, wisdom: 10, charisma: null,
    })).toBe(false);
    expect(areAbilityAssignmentsComplete({
      strength: 15, dexterity: 14, constitution: 13,
      intelligence: 12, wisdom: 10, charisma: 8,
    })).toBe(true);
  });

  it('keeps a background incomplete until its origin feat choices are filled', () => {
    const background = {
      feature: 'Origin Feat: Skilled',
      grants: [],
    } as unknown as DndBackground;
    const feats = [{
      index: 'skilled',
      name: 'Skilled',
      category: 'origin',
      description: 'Choose three skills.',
      grants: [{
        type: 'skill_choice',
        key: 'origin_feat:skilled_skills',
        name: 'Skill Proficiencies',
        choose: 3,
      }],
    }] satisfies DndFeat[];

    expect(isBackgroundSelectionComplete({ background, traits: {} }, feats)).toBe(false);
    expect(isBackgroundSelectionComplete({
      background,
      traits: { 'origin_feat:skilled_skills': ['Arcana', 'History', 'Survival'] },
    }, feats)).toBe(true);
  });

  it('keeps a picked feat source incomplete until its internal spell choices are configured', () => {
    const race = {
      index: 'human', subraces: [], grants: [{
        type: 'feat_pick', key: 'versatile', name: 'Versatile', choose: 1, category: 'origin',
      }],
    } as unknown as DndRace;
    const feat = {
      index: 'magic-initiate', name: 'Magic Initiate', category: 'origin', description: '',
      grants: [
        { type: 'choice', key: 'magic_initiate_list', name: 'List', choose: 1, options: [] },
        { type: 'choice', key: 'magic_initiate_ability', name: 'Ability', choose: 1, options: [] },
      ],
    } satisfies DndFeat;
    const base = { languages: ['Elvish', 'Dwarvish'], versatile: ['magic-initiate'] };

    expect(isRaceSelectionComplete({ race, subrace: null, traits: base }, [feat])).toBe(false);
    expect(isRaceSelectionComplete({
      race,
      subrace: null,
      traits: {
        ...base,
        'versatile:feat:magic_initiate_list': ['Wizard'],
        'versatile:feat:magic_initiate_ability': ['Intelligence'],
      },
    }, [feat])).toBe(true);
  });

  it('marks structured equipment incomplete until its package choice is resolved', () => {
    const cls = {
      starting_equipment: {
        fixed: [],
        groups: [{
          key: 'package',
          options: [{ key: 'a', label: 'Package A', items: [] }],
        }],
        gold: 0,
        goldAlternative: 100,
      },
    } as unknown as DndClass;

    expect(areStartingEquipmentChoicesComplete(cls, null, {}, {})).toBe(false);
    expect(areStartingEquipmentChoicesComplete(
      cls, null, { 'group:package': ['a'] }, {},
    )).toBe(true);
  });
});
