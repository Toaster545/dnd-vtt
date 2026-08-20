import { Injectable } from '@angular/core';
import { ActionActivation, TraitGrant, DndClass, DndFeat, DndItem, DndRace, Subclass } from './content.service';
import { resolveProgressiveChoiceLimit } from '../utils/progressive-choice';
import { AbilityScores, abilityModifier, proficiencyBonus } from '../models/character.model';

export interface CharacterAction {
  key: string;
  name: string;
  description?: string;
  activation: ActionActivation;
  source: string; // class name the feature came from
  maxUses: number;
  usedUses: number;
  per: 'short_rest' | 'long_rest';
  shortRestRestore: number;
}

type FeatureGrant = Extract<TraitGrant, { type: 'feature' }>;

interface AdditionalActionSources {
  characterLevel: number;
  race?: { data: DndRace; choices: Record<string, string[]> } | null;
  feats?: { feat: DndFeat; choices: Record<string, string[]>; source?: string }[];
  items?: DndItem[];
}

function resolveLevelValue<T>(base: T, byLevel: Record<string, T> | undefined, level: number): T {
  if (!byLevel) return base;
  return Object.entries(byLevel)
    .filter(([threshold]) => Number(threshold) <= level)
    .sort(([left], [right]) => Number(right) - Number(left))[0]?.[1] ?? base;
}

@Injectable({ providedIn: 'root' })
export class CharacterActionsService {
  // Aggregates every actionable class feature unlocked at each class's current level into a
  // flat list. A feature that reappears at a higher level under the same `key` (e.g. Action
  // Surge going from 1 to 2 uses) is the same resource, not a second one — the highest
  // unlocked level's declaration wins rather than being additive.
  compute(
    classes: { data: DndClass; level: number; subclass?: Subclass | null; choices?: Record<string, string[]> }[],
    resourceUses: Record<string, number>,
    abilityScores?: AbilityScores,
    additional: AdditionalActionSources = { characterLevel: 1 },
  ): CharacterAction[] {
    // `level` here is the unlock threshold (which level's declaration currently wins, e.g. Action
    // Surge's 1-use-vs-2-use text) — kept separate from `classLevel`, the character's actual
    // current level in that class, which is what a description's `{level}` placeholder means
    // (e.g. Second Wind's "1d10 + {level}" scales with current Fighter level, not the level 1
    // it was unlocked at).
    const winners = new Map<string, { level: number; classLevel: number; grant: FeatureGrant; source: string }>();

    const collect = (
      grants: TraitGrant[], choices: Record<string, string[]>, source: string,
      level: number, classLevel: number,
    ) => {
      for (const grant of grants) {
        if (grant.type === 'feature' && grant.action && grant.key) {
          const existing = winners.get(grant.key);
          if (!existing || level >= existing.level) winners.set(grant.key, { level, classLevel, grant, source });
          continue;
        }
        if (grant.type !== 'choice') continue;
        const selected = new Set(choices[grant.key] ?? []);
        for (const option of grant.options) {
          if (selected.has(option.name)) collect(option.grants ?? [], choices, source, level, classLevel);
        }
      }
    };

    for (const { data, level, subclass, choices = {} } of classes) {
      const levels = [...data.levels, ...(subclass?.levels ?? [])];
      for (const lvl of levels) {
        if (lvl.level > level) continue;
        collect(lvl.grants ?? [], choices, data.name, lvl.level, level);
      }
    }

    if (additional.race) {
      collect(additional.race.data.grants ?? [], additional.race.choices, additional.race.data.name, 0, additional.characterLevel);
    }
    for (const selection of additional.feats ?? []) {
      collect(selection.feat.grants ?? [], selection.choices, selection.source ?? selection.feat.name, 1, additional.characterLevel);
    }
    for (const item of additional.items ?? []) {
      for (const action of item.actions ?? []) {
        collect([{
          type: 'feature', key: action.key, name: action.name, description: action.description,
          action: { activation: action.activation, uses: action.uses },
        }], {}, item.name, 1, additional.characterLevel);
      }
    }

    return [...winners.values()].map(({ grant, source, classLevel }) => {
      const uses = grant.action!.uses;
      const progressiveMax = uses
        ? resolveProgressiveChoiceLimit(uses.max, uses.maxByLevel, classLevel)
        : 0;
      const abilityMax = uses?.maxAbilityModifier && abilityScores
        ? abilityModifier(abilityScores[uses.maxAbilityModifier])
        : null;
      const proficiencyMax = uses?.maxProficiencyBonus ? proficiencyBonus(additional.characterLevel) : null;
      const calculatedMax = abilityMax ?? proficiencyMax;
      const max = calculatedMax == null ? progressiveMax : Math.max(uses?.minimum ?? 0, calculatedMax);
      return {
        key: grant.key!,
        name: grant.name,
        description: grant.description?.replace('{level}', String(classLevel)),
        activation: grant.action!.activation,
        source,
        maxUses: max,
        usedUses: Math.min(resourceUses[grant.key!] ?? 0, max),
        per: uses ? resolveLevelValue(uses.per, uses.perByLevel, classLevel) : 'long_rest',
        shortRestRestore: uses?.shortRestRestore ?? 0,
      };
    });
  }

  use(resourceUses: Record<string, number>, action: CharacterAction): Record<string, number> {
    if (action.usedUses >= action.maxUses) return resourceUses;
    return { ...resourceUses, [action.key]: action.usedUses + 1 };
  }

  restore(resourceUses: Record<string, number>, action: CharacterAction): Record<string, number> {
    if (action.usedUses <= 0) return resourceUses;
    return { ...resourceUses, [action.key]: action.usedUses - 1 };
  }

  // Short rests clear short-rest pools and partially restore pools that explicitly say they do;
  // long rests clear every expended-use counter.
  rest(resourceUses: Record<string, number>, actions: CharacterAction[], type: 'short_rest' | 'long_rest'): Record<string, number> {
    const next = { ...resourceUses };
    for (const action of actions) {
      if (type === 'long_rest' || action.per === 'short_rest') {
        delete next[action.key];
      } else if (action.shortRestRestore > 0) {
        const remainingUsed = Math.max(0, action.usedUses - action.shortRestRestore);
        if (remainingUsed === 0) delete next[action.key];
        else next[action.key] = remainingUsed;
      }
    }
    return next;
  }
}
