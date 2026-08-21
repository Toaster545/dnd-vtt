import { Injectable } from '@angular/core';
import { Character, Ability, ABILITIES, SKILLS, abilityModifier, proficiencyBonus } from '../models/character.model';
import { DndBackground, DndClass, DndFeat, DndItem, DndRace } from './content.service';
import {
  ClassChoiceSource, RaceChoiceSource, activeEffects, averageHpFormula, baseArmorClass, collectFeatEffects, collectTraitEffects, equippedItems, resolveCharacterFeatPicks,
  unarmoredDefenseBonus,
} from '../utils/character-effects';
import { weaponMatchesAnyProficiency } from '../utils/weapon-proficiency';
import { resolveBackgroundOriginFeat } from '../utils/background-origin-feat';

export interface WeaponAttack {
  itemIndex: string;
  name: string;
  distance: string;
  attack_bonus: number;
  damage_dice: string;
  versatile_damage_dice?: string;
  damage_bonus: number;
  damage_type: string | null;
  is_pact_weapon?: boolean;
  mastery?: { property: string; description: string };
}

function versatileDamageDice(weapon: DndItem): string | undefined {
  for (const property of weapon.properties) {
    const match = property.match(/^Versatile\s*\(\s*(\d+d\d+)\s*\)/i);
    if (match) return match[1];
  }
  return undefined;
}

export interface ComputedStats {
  proficiency_bonus: number;
  ability_modifiers: Record<Ability, number>;
  suggested_max_hp: number;
  initiative: number;
  initiative_advantage: boolean;
  saving_throw_proficient: Set<string>;
  saving_throw_bonuses: Record<Ability, number>;
  skill_bonuses: Record<string, number>;
  passive_perception: number;
  passive_investigation: number;
  passive_insight: number;
  spell_attack_bonus: number | null;
  spell_save_dc: number | null;
  // Live AC — from whatever's actually equipped right now (armor's own formula, or 10 + Dex if
  // unarmored, plus a shield's bonus) plus any conditional effect currently active (e.g.
  // Defense's "+1 while wearing armor"). Not `char.armor_class` — that stored field is only
  // used by the separate player-facing character sheet's manual editor.
  computed_ac: number;
  unarmed_attack: WeaponAttack;
  weapon_attacks: WeaponAttack[];
}

// Weapon proficiency comes from book-facing labels that can name broad categories, restricted
// categories (such as the Rogue's Finesse-or-Light martial weapons), or specific weapons.
function classGrantsProficiency(weapon: DndItem, classData: DndClass): boolean {
  return weaponMatchesAnyProficiency(weapon, classData.weapon_proficiencies);
}

function isProficientWithWeapon(
  weapon: DndItem, classesForFeats: ClassChoiceSource[], feats: DndFeat[], race: RaceChoiceSource | null,
): boolean {
  if (classesForFeats.some(({ data }) => classGrantsProficiency(weapon, data))) return true;
  // A feat granting a whole weapon category (e.g. Martial Weapon Training's `tags: ['martial']`)
  // rather than the fixed `value` count of specific weapons some feats describe but never let
  // the player actually name (e.g. Weapon Master) — only category-tagged grants are resolvable
  // to "is the character proficient with THIS weapon" generically.
  const categoryGrants = collectTraitEffects(classesForFeats, feats, race)
    .filter(e => e.type === 'weapon_proficiency' && e.tags?.length);
  return categoryGrants.some(e => e.tags!.some(tag => weapon.category.toLowerCase().startsWith(tag.toLowerCase())));
}

// Melee uses Strength, ranged uses Dexterity, and Finesse weapons use whichever is better.
function weaponAbilityMod(weapon: DndItem, mods: Record<Ability, number>): number {
  if (weapon.properties.includes('Finesse')) return Math.max(mods.strength, mods.dexterity);
  return weapon.category.includes('Ranged') ? mods.dexterity : mods.strength;
}

function weaponDistance(weapon: DndItem): string {
  const isMelee = weapon.category.includes('Melee');
  const rangeProperty = weapon.properties.find(property => /(?:Ammunition|Thrown).*?\d+\s*\/\s*\d+/i.test(property));
  const range = rangeProperty?.match(/(\d+)\s*\/\s*(\d+)/);
  const distance = range ? `${range[1]}/${range[2]} ft.` : '';

  if (!isMelee) return distance;

  const reach = weapon.properties.some(property => property.toLowerCase() === 'reach')
    ? '10 ft. reach'
    : '5 ft. reach';
  return rangeProperty?.toLowerCase().startsWith('thrown') && distance
    ? `${reach} · ${distance} thrown`
    : reach;
}

@Injectable({ providedIn: 'root' })
export class CharacterStatsService {
  compute(
    char: Character, classData: DndClass | null, raceData: DndRace | null,
    feats: DndFeat[] = [], classesForFeats: ClassChoiceSource[] = [], items: DndItem[] = [],
    backgroundData: DndBackground | null = null,
  ): ComputedStats {
    const prof = proficiencyBonus(char.level);
    const scores = char.ability_scores;

    const mods = ABILITIES.reduce((acc, ab) => ({
      ...acc, [ab]: abilityModifier(scores[ab] ?? 10),
    }), {} as Record<Ability, number>);

    const raceForFeats: RaceChoiceSource | null = raceData ? {
      data: raceData,
      choices: char.race_choices ?? {},
      subrace: char.subrace,
    } : null;
    const equipment = [
      ...char.equipment,
      ...(char.replicated_items ?? []).map(entry => ({
        itemIndex: entry.itemIndex, name: entry.planName, quantity: 1, equipped: entry.equipped,
      })),
    ];
    const allEffects = [
      ...collectTraitEffects(classesForFeats, feats, raceForFeats),
      ...collectFeatEffects(resolveBackgroundOriginFeat(backgroundData, feats), char.background_choices ?? {}),
      ...equippedItems(equipment, items).flatMap(item => item.effects ?? []),
    ];

    const hit_die = classData?.hit_die ?? 8;
    const hpBonusPerLevel = allEffects
      .filter(effect => effect.type === 'hp_bonus_per_level')
      .reduce((sum, effect) => sum + (effect.value ?? 0), 0);
    const suggested_max_hp = averageHpFormula(char.level, hit_die, mods.constitution, hpBonusPerLevel);

    const saveProfSet = new Set(classData?.saving_throws ?? []);
    for (const effect of allEffects.filter(effect => effect.type === 'saving_throw_proficiency')) {
      for (const ability of effect.tags ?? []) saveProfSet.add(ability);
    }
    // Resilient-pattern feats grant save proficiency in whichever ability their abilityIncrease
    // increased (the player-chosen one, when the feat offers more than one option).
    for (const { feat, ability } of resolveCharacterFeatPicks(classesForFeats, feats, raceForFeats)) {
      const inc = feat.abilityIncrease;
      if (!inc?.grantsSaveProficiency) continue;
      const granted = inc.abilities.length === 1 ? inc.abilities[0] : ability;
      if (granted) saveProfSet.add(granted);
    }
    const savingThrowAbilityBonus = allEffects
      .filter(effect => effect.type === 'saving_throw_ability_bonus')
      .reduce((sum, effect) => {
        if (!effect.ability) return sum;
        const modifier = mods[effect.ability];
        return sum + Math.max(effect.minimum ?? modifier, modifier);
      }, 0);
    const saving_throw_bonuses = ABILITIES.reduce((acc, ab) => ({
      ...acc, [ab]: mods[ab] + (saveProfSet.has(ab) ? prof : 0) + savingThrowAbilityBonus,
    }), {} as Record<Ability, number>);

    const conditionalAcBonus = activeEffects(allEffects.filter(e => e.type === 'ac_bonus'), equipment, items)
      .reduce((sum, e) => sum + (e.value ?? 0), 0);
    const unarmoredBonus = unarmoredDefenseBonus(
      activeEffects(allEffects.filter(e => e.type === 'unarmored_defense'), equipment, items),
      mods,
    );
    const computed_ac = baseArmorClass(equipment, items, mods.dexterity) + conditionalAcBonus + unarmoredBonus;

    const untrainedSkillBonus = allEffects
      .filter(effect => effect.type === 'untrained_skill_bonus')
      .reduce((sum, effect) =>
        sum + (effect.tags?.includes('half_proficiency') ? Math.floor(prof / 2) : (effect.value ?? 0)), 0);
    const skill_bonuses = Object.fromEntries(
      Object.entries(SKILLS).map(([skill, ability]) => {
        const proficient = !!(char.skills?.[skill]);
        const expert   = !!(char.expertise?.[skill]);
        const abilityBonuses = allEffects
          .filter(effect => effect.type === 'skill_ability_bonus' && effect.tags?.includes(skill))
          .reduce((sum, effect) => {
            if (!effect.ability) return sum;
            const modifier = mods[effect.ability];
            return sum + Math.max(effect.minimum ?? modifier, modifier);
          }, 0);
        return [
          skill,
          mods[ability] + (expert ? prof * 2 : proficient ? prof : untrainedSkillBonus) + abilityBonuses,
        ];
      }),
    );

    const passive_perception = 10 + (skill_bonuses['Perception'] ?? mods.wisdom);
    const passive_investigation = 10 + (skill_bonuses['Investigation'] ?? mods.intelligence);
    const passive_insight = 10 + (skill_bonuses['Insight'] ?? mods.wisdom);

    const unarmed_attack: WeaponAttack = {
      itemIndex: 'unarmed-strike',
      name: 'Unarmed Strike',
      distance: '5 ft. reach',
      attack_bonus: mods.strength + prof,
      damage_dice: '1',
      damage_bonus: mods.strength,
      damage_type: 'bludgeoning',
    };

    const hasPactOfTheBlade = classesForFeats.some(({ data, choices }) =>
      data.index === 'warlock'
      && Object.values(choices).some(selection => selection.includes('Pact of the Blade')));
    const pactState = hasPactOfTheBlade ? char.pact_weapon : undefined;
    const bondedWeaponIsCarried = pactState?.mode !== 'bonded'
      || char.equipment.some(entry => entry.itemIndex === pactState.itemIndex);
    const pactWeaponIndex = pactState && bondedWeaponIsCarried ? pactState.itemIndex : undefined;
    const attackWeapons = equippedItems(equipment, items);
    const pactWeapon = pactWeaponIndex ? items.find(item => item.index === pactWeaponIndex) : undefined;
    if (pactWeapon && !attackWeapons.some(item => item.index === pactWeapon.index)) {
      attackWeapons.push(pactWeapon);
    }

    const weapon_attacks: WeaponAttack[] = attackWeapons
      .filter(it => it.type === 'weapon')
      .map(weapon => {
        const isPactWeapon = weapon.index === pactWeaponIndex;
        const abilityMod = isPactWeapon ? mods.charisma : weaponAbilityMod(weapon, mods);
        const proficient = isPactWeapon || isProficientWithWeapon(weapon, classesForFeats, feats, raceForFeats);
        const isRanged = weapon.category.includes('Ranged');
        const isThrown = weapon.properties.some(p => p.startsWith('Thrown'));

        const rangedAttackBonus = isRanged
          ? activeEffects(allEffects.filter(e => e.type === 'ranged_attack_bonus'), equipment, items)
              .reduce((sum, e) => sum + (e.value ?? 0), 0)
          : 0;
        const meleeDamageBonus = !isRanged
          ? activeEffects(allEffects.filter(e => e.type === 'melee_damage_bonus'), equipment, items)
              .reduce((sum, e) => sum + (e.value ?? 0), 0)
          : 0;
        const thrownDamageBonus = isThrown
          ? activeEffects(allEffects.filter(e => e.type === 'thrown_damage_bonus'), equipment, items)
              .reduce((sum, e) => sum + (e.value ?? 0), 0)
          : 0;

        return {
          itemIndex: weapon.index,
          name: weapon.name,
          distance: weaponDistance(weapon),
          attack_bonus: abilityMod + (proficient ? prof : 0) + rangedAttackBonus,
          damage_dice: weapon.damage ?? '',
          versatile_damage_dice: versatileDamageDice(weapon),
          damage_bonus: abilityMod + meleeDamageBonus + thrownDamageBonus,
          damage_type: isPactWeapon
            ? [weapon.damage_type, 'necrotic', 'psychic', 'radiant'].filter(Boolean).join(' / ')
            : weapon.damage_type ?? null,
          is_pact_weapon: isPactWeapon,
          mastery: weapon.mastery,
        };
      });

    const spellcastingAbility = classData?.spellcasting_ability as Ability | undefined;
    const spell_attack_bonus = spellcastingAbility != null
      ? prof + mods[spellcastingAbility] : null;
    const spell_save_dc = spellcastingAbility != null
      ? 8 + prof + mods[spellcastingAbility] : null;

    const initiativeAbilityBonus = allEffects
      .filter(effect => effect.type === 'initiative_ability_bonus')
      .reduce((sum, effect) => {
        if (!effect.ability) return sum;
        const modifier = mods[effect.ability];
        return sum + Math.max(effect.minimum ?? modifier, modifier);
      }, 0);
    const initiativeProficiencyBonus = allEffects.some(effect => effect.type === 'initiative_proficiency_bonus')
      ? prof
      : 0;
    const initiative_advantage = allEffects.some(effect => effect.type === 'initiative_advantage');

    return {
      proficiency_bonus: prof,
      ability_modifiers: mods,
      suggested_max_hp,
      initiative: mods.dexterity + initiativeAbilityBonus + initiativeProficiencyBonus,
      initiative_advantage,
      saving_throw_proficient: saveProfSet,
      saving_throw_bonuses,
      skill_bonuses,
      computed_ac,
      unarmed_attack,
      weapon_attacks,
      passive_perception,
      passive_investigation,
      passive_insight,
      spell_attack_bonus,
      spell_save_dc,
    };
  }

  fmt(n: number): string { return n >= 0 ? `+${n}` : `${n}`; }
}
