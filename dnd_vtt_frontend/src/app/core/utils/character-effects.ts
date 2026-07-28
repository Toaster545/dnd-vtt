import { EquipmentEntry } from '../models/character.model';
import { DndClass, DndFeat, DndItem, DndRace, EffectCondition, TraitEffect, TraitGrant } from '../services/content.service';

// One selected class's data paired with its stored trait picks — the minimal shape needed to
// walk `grants` and resolve what a character actually chose, shared between the wizard's live
// draft state (ClassEntry) and a saved Character's `classes[].choices`.
export interface ClassChoiceSource {
  data: DndClass;
  choices: Record<string, string[]>;
}

export interface RaceChoiceSource {
  data: DndRace;
  choices: Record<string, string[]>;
  subrace?: string | null;
}

export interface FeatPick {
  feat: DndFeat;
  // The companion `${grantKey}:feat_ability` pick, when the feat's abilityIncrease offers more
  // than one eligible ability (e.g. Resilient) — otherwise undefined.
  ability?: string;
}

// Every feat the character has actually taken, across every class/subclass's `ability_choice`
// (taken instead of an ASI) and `feat_pick` grants — the single source of truth other
// resolvers (effects, save proficiency, repeatable-feat gating) build on.
function activeRaceGrants(source: RaceChoiceSource): TraitGrant[] {
  const subrace = source.subrace
    ? source.data.subraces.find(sub => sub.name === source.subrace || sub.index === source.subrace)
    : null;
  return [...(source.data.grants ?? []), ...(subrace?.grants ?? [])];
}

export function resolveCharacterFeatPicks(
  classes: ClassChoiceSource[], feats: DndFeat[], race: RaceChoiceSource | null = null,
): FeatPick[] {
  const out: FeatPick[] = [];
  const byIndex = (index: string) => feats.find(f => f.index === index);
  for (const { data, choices } of classes) {
    const levels = [...data.levels, ...data.subclasses.flatMap(s => s.levels)];
    for (const lvl of levels) {
      for (const grant of lvl.grants ?? []) {
        if (grant.type === 'ability_choice') {
          const featIndex = choices[`${grant.key}:feat`]?.[0];
          const feat = featIndex ? byIndex(featIndex) : undefined;
          if (feat) out.push({ feat, ability: choices[`${grant.key}:feat_ability`]?.[0] });
        } else if (grant.type === 'feat_pick') {
          for (const featIndex of choices[grant.key] ?? []) {
            const feat = byIndex(featIndex);
            if (feat) out.push({ feat, ability: choices[`${grant.key}:feat_ability`]?.[0] });
          }
        }
      }
    }
  }
  if (race) {
    for (const grant of activeRaceGrants(race)) {
      if (grant.type !== 'feat_pick') continue;
      for (const featIndex of race.choices[grant.key] ?? []) {
        const feat = byIndex(featIndex);
        if (feat) out.push({ feat, ability: race.choices[`${grant.key}:feat_ability`]?.[0] });
      }
    }
  }
  return out;
}

// Every structured TraitEffect the character currently carries — from an embedded class
// `choice` option (e.g. a Fighting Style listed directly on a class) or from a picked feat.
// Effects with a `condition` are included unfiltered here; callers that care whether the
// condition currently holds should filter with `evaluateCondition`/`activeEffects` below.
export function collectTraitEffects(
  classes: ClassChoiceSource[], feats: DndFeat[], race: RaceChoiceSource | null = null,
): TraitEffect[] {
  const out: TraitEffect[] = [];
  const collectGrantEffects = (grants: TraitGrant[], choices: Record<string, string[]>) => {
    for (const grant of grants) {
      if (grant.type === 'feature') {
        out.push(...(grant.effects ?? []));
        continue;
      }
      if (grant.type !== 'choice') continue;
      const picked = choices[grant.key] ?? [];
      for (const opt of grant.options) {
        if (!picked.includes(opt.name)) continue;
        out.push(...(opt.effects ?? []));
      }
    }
  };
  for (const { data, choices } of classes) {
    const levels = [...data.levels, ...data.subclasses.flatMap(s => s.levels)];
    for (const lvl of levels) {
      collectGrantEffects(lvl.grants ?? [], choices);
    }
  }
  if (race) collectGrantEffects(activeRaceGrants(race), race.choices);
  for (const { feat } of resolveCharacterFeatPicks(classes, feats, race)) {
    out.push(...(feat.effects ?? []));
  }
  return out;
}

// What's actually equipped right now, resolved against the item catalog — the shared basis for
// both condition evaluation and AC computation below, so they can never disagree about what
// "wearing armor" means.
export function equippedItems(equipment: EquipmentEntry[], items: DndItem[]): DndItem[] {
  return equipment
    .filter(e => e.equipped)
    .map(e => items.find(it => it.index === e.itemIndex))
    .filter((it): it is DndItem => !!it);
}

export const isShieldItem = (it: DndItem) => it.category === 'Shield';
export const isArmorItem  = (it: DndItem) => it.type === 'armor' && !isShieldItem(it);

// Checks a condition against what's actually equipped right now — the only place that decides
// what "wearing armor"/"wielding a shield"/etc. means, so every caller agrees.
export function evaluateCondition(condition: EffectCondition, equipment: EquipmentEntry[], items: DndItem[]): boolean {
  const equipped = equippedItems(equipment, items);

  const isWeapon    = (it: DndItem) => it.type === 'weapon';
  const isMelee     = (it: DndItem) => it.category.includes('Melee');
  const isTwoHanded = (it: DndItem) => it.properties.includes('Two-Handed');

  switch (condition) {
    case 'wearing_armor':   return equipped.some(isArmorItem);
    case 'no_armor':        return !equipped.some(isArmorItem);
    case 'wielding_shield': return equipped.some(isShieldItem);
    case 'two_handed_melee':
      return equipped.some(it => isWeapon(it) && isMelee(it) && isTwoHanded(it));
    case 'one_handed_melee_no_offhand': {
      const weapons = equipped.filter(isWeapon);
      return weapons.length === 1 && isMelee(weapons[0]) && !isTwoHanded(weapons[0]);
    }
    case 'dual_wielding_melee': {
      const weapons = equipped.filter(isWeapon);
      return weapons.length === 2 && weapons.every(w => isMelee(w) && !isTwoHanded(w));
    }
  }
}

// Effects with no condition, plus conditioned effects whose condition currently holds.
export function activeEffects(effects: TraitEffect[], equipment: EquipmentEntry[], items: DndItem[]): TraitEffect[] {
  return effects.filter(e => !e.condition || evaluateCondition(e.condition, equipment, items));
}

// The leading number in a DndItem.armor_class string — "16" → 16, "11 + DEX" → 11, "+2" → 2.
function armorClassBase(armorClass: string | undefined): number {
  const match = armorClass?.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// How much of the Dexterity modifier an equipped armor's category lets you add — full for
// Light Armor, capped at +2 for Medium Armor, none for Heavy Armor. Unarmored (and any category
// that isn't one of the three) defaults to the full modifier, same as being unarmored.
function armorDexBonus(category: string, dexMod: number): number {
  if (category.includes('Heavy')) return 0;
  if (category.includes('Medium')) return Math.min(dexMod, 2);
  return dexMod;
}

// AC from what's actually equipped right now: the worn armor's own formula (or 10 + Dex if
// nothing's worn), plus a shield's flat bonus — live off `equipment`, not baked in once at
// character creation, so putting on/taking off Chain Mail actually changes displayed AC.
export function baseArmorClass(equipment: EquipmentEntry[], items: DndItem[], dexMod: number): number {
  const equipped = equippedItems(equipment, items);
  const armor  = equipped.find(isArmorItem);
  const shield = equipped.find(isShieldItem);
  const base = armor ? armorClassBase(armor.armor_class) + armorDexBonus(armor.category, dexMod) : 10 + dexMod;
  return base + (shield ? armorClassBase(shield.armor_class) : 0);
}
