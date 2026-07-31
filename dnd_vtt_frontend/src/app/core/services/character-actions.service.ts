import { Injectable } from '@angular/core';
import { ActionActivation, TraitGrant, DndClass, Subclass } from './content.service';
import { resolveProgressiveChoiceLimit } from '../utils/progressive-choice';

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

@Injectable({ providedIn: 'root' })
export class CharacterActionsService {
  // Aggregates every actionable class feature unlocked at each class's current level into a
  // flat list. A feature that reappears at a higher level under the same `key` (e.g. Action
  // Surge going from 1 to 2 uses) is the same resource, not a second one — the highest
  // unlocked level's declaration wins rather than being additive.
  compute(
    classes: { data: DndClass; level: number; subclass?: Subclass | null }[],
    resourceUses: Record<string, number>,
  ): CharacterAction[] {
    // `level` here is the unlock threshold (which level's declaration currently wins, e.g. Action
    // Surge's 1-use-vs-2-use text) — kept separate from `classLevel`, the character's actual
    // current level in that class, which is what a description's `{level}` placeholder means
    // (e.g. Second Wind's "1d10 + {level}" scales with current Fighter level, not the level 1
    // it was unlocked at).
    const winners = new Map<string, { level: number; classLevel: number; grant: FeatureGrant; source: string }>();

    for (const { data, level, subclass } of classes) {
      const levels = [...data.levels, ...(subclass?.levels ?? [])];
      for (const lvl of levels) {
        if (lvl.level > level) continue;
        for (const grant of lvl.grants ?? []) {
          if (grant.type !== 'feature' || !grant.action || !grant.key) continue;
          const existing = winners.get(grant.key);
          if (!existing || lvl.level >= existing.level) {
            winners.set(grant.key, { level: lvl.level, classLevel: level, grant, source: data.name });
          }
        }
      }
    }

    return [...winners.values()].map(({ grant, source, classLevel }) => {
      const uses = grant.action!.uses;
      const max = uses
        ? resolveProgressiveChoiceLimit(uses.max, uses.maxByLevel, classLevel)
        : 0;
      return {
        key: grant.key!,
        name: grant.name,
        description: grant.description?.replace('{level}', String(classLevel)),
        activation: grant.action!.activation,
        source,
        maxUses: max,
        usedUses: Math.min(resourceUses[grant.key!] ?? 0, max),
        per: uses?.per ?? 'long_rest',
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
