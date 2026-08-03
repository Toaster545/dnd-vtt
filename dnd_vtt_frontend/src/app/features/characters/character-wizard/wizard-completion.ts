import {
  Ability, ABILITIES, ScoreMethod, POINT_BUY_BUDGET, POINT_BUY_MIN, POINT_BUY_MAX, POINT_BUY_COST,
} from '../../../core/models/character.model';
import { DndBackground, DndClass, DndFeat, DndRace, TraitGrant } from '../../../core/services/content.service';
import { reachableGrants } from '../../../core/utils/character-effects';
import { resolveProgressiveChoiceLimit } from '../../../core/utils/progressive-choice';
import { isEquipmentComplete, isStructuredEquipment } from '../../../core/utils/starting-equipment';
import { resolveBackgroundOriginFeat } from '../../../core/utils/background-origin-feat';

type Choices = Record<string, string[]>;

export interface RaceCompletionSource {
  race: DndRace;
  subrace: DndRace['subraces'][number] | null;
  traits: Choices;
}

export interface ClassCompletionSource {
  cls: DndClass;
  level: number;
  subclass: string;
  skills: string[];
  traits: Choices;
}

export interface BackgroundCompletionSource {
  background: DndBackground;
  traits: Choices;
}

function picked(choices: Choices, key: string): number {
  return choices[key]?.length ?? 0;
}

function simpleGrantComplete(grant: TraitGrant, choices: Choices): boolean {
  if (grant.type !== 'choice' && grant.type !== 'skill_choice' && grant.type !== 'feat_pick') return true;
  return picked(choices, grant.key) >= grant.choose;
}

function featGrantsComplete(feat: DndFeat | undefined, parentKey: string, choices: Choices): boolean {
  if (!feat) return false;
  return (feat.grants ?? []).every(grant => {
    if (grant.type !== 'choice' && grant.type !== 'skill_choice') return true;
    return picked(choices, `${parentKey}:feat:${grant.key}`) >= grant.choose;
  });
}

export function isRaceSelectionComplete(selection: RaceCompletionSource | null, feats: DndFeat[] = []): boolean {
  if (!selection) return false;
  const { race, subrace, traits } = selection;
  if (race.subraces.length > 0 && !subrace) return false;
  if ((race.size_options?.length ?? 0) > 1 && picked(traits, 'size') < 1) return false;
  if (picked(traits, 'languages') < 2) return false;

  const grants = [...(race.grants ?? []), ...(subrace?.grants ?? [])];
  return grants.every(grant => {
    if (!simpleGrantComplete(grant, traits)) return false;
    if (grant.type !== 'feat_pick') return true;
    return (traits[grant.key] ?? []).every(index =>
      featGrantsComplete(feats.find(feat => feat.index === index), grant.key, traits));
  });
}

function classGrantComplete(
  grant: TraitGrant,
  entry: ClassCompletionSource,
  feats: DndFeat[],
): boolean {
  switch (grant.type) {
    case 'skill_choice':
      return grant.key === 'skills'
        ? entry.skills.length >= grant.choose
        : picked(entry.traits, grant.key) >= grant.choose;
    case 'expertise_choice':
      return picked(entry.traits, grant.key) >= grant.choose;
    case 'choice':
      return picked(entry.traits, grant.key) >=
        resolveProgressiveChoiceLimit(grant.choose, grant.chooseByLevel, entry.level);
    case 'weapon_mastery':
      return picked(entry.traits, grant.key) >= grant.choose;
    case 'feat_pick':
      return picked(entry.traits, grant.key) >= grant.choose
        && (entry.traits[grant.key] ?? []).every(index =>
          featGrantsComplete(feats.find(feat => feat.index === index), grant.key, entry.traits));
    case 'ability_choice': {
      const featIndex = grant.allowFeat ? entry.traits[`${grant.key}:feat`]?.[0] : undefined;
      if (!featIndex) return picked(entry.traits, grant.key) >= grant.points;
      const feat = feats.find(candidate => candidate.index === featIndex);
      if (!feat) return false;
      const needsAbility = (feat.abilityIncrease?.abilities.length ?? 0) > 1;
      return (!needsAbility || picked(entry.traits, `${grant.key}:feat_ability`) >= 1)
        && featGrantsComplete(feat, grant.key, entry.traits);
    }
    default:
      return true;
  }
}

export function areClassSelectionsComplete(entries: ClassCompletionSource[], feats: DndFeat[]): boolean {
  if (entries.length === 0) return false;
  return entries.every(entry => {
    if (entry.level >= entry.cls.subclass_level && entry.cls.subclasses.length > 0 && !entry.subclass) return false;
    return reachableGrants(entry.cls, entry.subclass, entry.level)
      .every(grant => classGrantComplete(grant, entry, feats));
  });
}

export function isBackgroundSelectionComplete(
  selection: BackgroundCompletionSource | null,
  feats: DndFeat[] = [],
): boolean {
  if (!selection) return false;
  const backgroundComplete = (selection.background.grants ?? []).every(grant => {
    if (grant.type === 'ability_choice') return picked(selection.traits, grant.key) >= grant.points;
    return simpleGrantComplete(grant, selection.traits);
  });
  const originFeat = resolveBackgroundOriginFeat(selection.background, feats);
  return backgroundComplete
    && (originFeat?.grants ?? []).every(grant => simpleGrantComplete(grant, selection.traits));
}

export function areAbilityAssignmentsComplete(
  assignments: Record<Ability, number | null>,
  method: ScoreMethod = 'standard',
): boolean {
  if (!ABILITIES.every(ability => assignments[ability] !== null)) return false;
  if (method !== 'pointbuy') return true;
  const scores = assignments as Record<Ability, number>;
  const inRange = ABILITIES.every(ability => scores[ability] >= POINT_BUY_MIN && scores[ability] <= POINT_BUY_MAX);
  const spent = ABILITIES.reduce((sum, ability) => sum + (POINT_BUY_COST[scores[ability]] ?? Infinity), 0);
  return inRange && spent <= POINT_BUY_BUDGET;
}

export function areStartingEquipmentChoicesComplete(
  cls: DndClass | null,
  background: DndBackground | null,
  classChoices: Choices,
  backgroundChoices: Choices,
): boolean {
  const sources: [unknown, Choices][] = [
    [cls?.starting_equipment, classChoices],
    [background?.starting_equipment, backgroundChoices],
  ];
  return sources.every(([equipment, choices]) =>
    !isStructuredEquipment(equipment) || isEquipmentComplete(equipment, choices));
}
