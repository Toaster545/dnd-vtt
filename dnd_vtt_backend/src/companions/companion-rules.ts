import { abilityModifier } from '../common/ability';
// Playable definitions are versioned separately from reference-only bestiary entries.
export type CompanionKind = 'primal' | 'steel';
export type CompanionForm = 'land' | 'sea' | 'sky' | 'defender';
export interface CompanionOwner {
  id: string;
  user_id: string;
  campaign_id?: string | null;
  name: string;
  class: string;
  subclass?: string;
  level: number;
  classes?: { name: string; subclass?: string; level: number }[];
  ability_scores?: Record<string, number>;
  conditions?: string[];
  resource_uses?: Record<string, number>;
  [key: string]: unknown;
}
export interface CompanionState {
  kind: CompanionKind;
  form: CompanionForm;
  name: string;
  portrait_image?: string;
  status: 'active' | 'dead' | 'dismissed';
  died_at?: string;
  // Damage, rather than a cached maximum, preserves wounds when the owner levels up.
  damage: number;
  temp_hp: number;
  conditions: string[];
  resource_uses: Record<string, number>;
  hit_dice_used: number;
  revision: number;
}
export interface CompanionTurn {
  encounterId: string;
  turnKey: string;
  ownerTurn: boolean;
  command?: string;
  commandCost?: 'bonus_action' | 'replace_attack';
  actionUsed?: boolean;
  bonusUsed?: boolean;
  reactionUsed?: boolean;
}
export function isIncapacitated(conditions: string[] = []) {
  return conditions.some((c) =>
    [
      'incapacitated',
      'unconscious',
      'stunned',
      'paralyzed',
      'petrified',
    ].includes(c.toLowerCase()),
  );
}
export interface CompanionAction {
  key: string;
  name: string;
  activation: 'action' | 'bonus_action' | 'reaction';
  description: string;
  attack_bonus?: number;
  damage?: string;
  damage_type?: string;
  reach?: number;
  uses?: number;
  used?: number;
  attacks?: number;
  basic?: boolean;
}
const slug = (s: string | undefined) =>
  (s ?? '').toLowerCase().replace(/\s+/g, '-');
export function companionLevel(
  owner: CompanionOwner,
  kind: CompanionKind,
): number {
  const name = kind === 'primal' ? 'ranger' : 'artificer';
  const subclass = kind === 'primal' ? 'beast-master' : 'battle-smith';
  const entries = owner.classes?.length
    ? owner.classes
    : [{ name: owner.class, subclass: owner.subclass, level: owner.level }];
  const entry = entries.find(
    (c) => slug(c.name) === name && slug(c.subclass) === subclass,
  );
  return entry && entry.level >= 3 ? entry.level : 0;
}
export function companionOptions(owner: CompanionOwner) {
  return (['primal', 'steel'] as const)
    .filter((kind) => companionLevel(owner, kind) > 0)
    .map((kind) => ({
      kind,
      name: kind === 'primal' ? 'Primal Companion' : 'Steel Defender',
      source: kind === 'primal' ? 'XPHB' : 'EFA',
      version: 1,
      forms: kind === 'primal' ? ['land', 'sea', 'sky'] : ['defender'],
    }));
}
export function resolveCompanion(owner: CompanionOwner, state: CompanionState) {
  const level = companionLevel(owner, state.kind);
  const steel = state.kind === 'steel';
  const sky = state.form === 'sky';
  const sea = state.form === 'sea';
  const ability = steel ? 'intelligence' : 'wisdom';
  const abilityMod = abilityModifier(owner.ability_scores?.[ability] ?? 10);
  const pb = Math.ceil(owner.level / 4) + 1;
  const maxHp = (sky ? 4 : 5) * (level + 1);
  const scores = steel
    ? [14, 12, 14, 4, 10, 6]
    : sky
      ? [6, 16, 13, 8, 14, 11]
      : [14, 14, 15, 8, 14, 11];
  const abilities = Object.fromEntries(
    [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ].map((key, i) => [key, scores[i]]),
  );
  const traits = [
    {
      name: steel ? 'Steel Bond' : 'Primal Bond',
      description: `Ability checks and saving throws include your proficiency bonus (+${pb}).`,
    },
  ];
  if (!steel)
    traits.push({
      name: 'Primal Markings',
      description:
        'Its animal appearance bears magical markings that reveal its supernatural origin. You choose their appearance when you summon the beast.',
    });
  if (sky)
    traits.push({
      name: 'Flyby',
      description: 'Flying out of reach does not provoke opportunity attacks.',
    });
  if (sea)
    traits.push({ name: 'Amphibious', description: 'Breathes air and water.' });
  if (!steel && !sky && !sea)
    traits.push({
      name: 'Charge',
      description:
        'After moving at least 20 feet straight toward the target, Beast’s Strike adds 1d6 damage of the same type on a hit. A Large or smaller target also falls Prone; no saving throw is required.',
    });
  if (!steel && level >= 7)
    traits.push({
      name: 'Exceptional Training',
      description:
        'A bonus-action command also permits Dash, Disengage, Dodge, or Help as the beast’s bonus action. Its attack damage can be Force.',
    });
  if (!steel && level >= 11)
    traits.push({
      name: 'Bestial Fury',
      description:
        'A commanded Beast’s Strike makes two attacks. The first hit each turn against your Hunter’s Mark target adds that spell’s bonus damage as Force.',
    });
  if (!steel && level >= 15)
    traits.push({
      name: 'Share Spells',
      description:
        'A spell you cast on yourself can also affect your beast within 30 feet.',
    });
  if (steel && level >= 9)
    traits.push({
      name: 'Arcane Jolt',
      description: `On your or your defender’s hit, add ${level >= 15 ? '4d6' : '2d6'} Force damage or healing. Uses your character’s Arcane Jolt pool; once per turn.`,
    });
  const damageBonus = abilityMod + (sky ? 3 : 2);
  const actions: CompanionAction[] = [
    {
      key: 'strike',
      name: steel ? 'Force-Empowered Rend' : 'Beast’s Strike',
      activation: 'action',
      attack_bonus: pb + abilityMod,
      reach: 5,
      damage: `1d${sky ? 4 : sea ? 6 : 8}${damageBonus >= 0 ? '+' : ''}${damageBonus}`,
      damage_type: steel
        ? 'Force'
        : sky
          ? 'Slashing'
          : sea
            ? 'Bludgeoning or Piercing'
            : 'Bludgeoning, Piercing, or Slashing',
      attacks: !steel && level >= 11 ? 2 : 1,
      description: sea
        ? `A hit also grapples the target (escape DC ${8 + pb + abilityMod}).`
        : 'Uses the owner’s class spell attack modifier.',
    },
  ];
  if (steel)
    actions.push({
      key: 'repair',
      name: 'Repair',
      activation: 'action',
      description: `Restore 2d8 ${abilityMod >= 0 ? '+' : '−'} ${Math.abs(abilityMod)} HP to itself or a Construct or object within 5 feet.`,
      uses: 3,
      used: state.resource_uses.repair ?? 0,
    });
  for (const [name, description] of [
    ['Dash', 'Gain additional movement equal to your current Speed this turn.'],
    [
      'Disengage',
      'Your movement does not provoke Opportunity Attacks for the rest of this turn.',
    ],
    [
      'Dodge',
      'Until your next turn, visible attackers have Disadvantage against you and your Dexterity saves have Advantage. This ends if you are Incapacitated or your Speed becomes 0.',
    ],
    [
      'Help',
      'Assist an ally’s ability check, or distract an enemy within 5 feet to grant Advantage on the next allied attack against it before your next turn.',
    ],
    [
      'Hide',
      'Try to hide with a Dexterity (Stealth) check when cover or concealment permits.',
    ],
    [
      'Search',
      'Make a Wisdom check to notice something; the DM determines the relevant skill.',
    ],
    [
      'Ready',
      'Choose a perceivable trigger, then use your Reaction to take the readied action or movement when it occurs.',
    ],
  ])
    actions.push({
      key: name.toLowerCase(),
      name,
      activation: 'action',
      description,
      basic: true,
    });
  actions.push({
    ...actions[0],
    key: 'opportunity',
    name: 'Opportunity Attack',
    activation: 'reaction',
    attacks: 1,
    description:
      'Make one melee attack when a hostile creature provokes an opportunity attack.',
  });
  if (steel)
    actions.push({
      key: 'deflect',
      name: 'Deflect Attack',
      activation: 'reaction',
      description: `Impose Disadvantage on an attack against another creature when the attacker is within 5 feet of the defender.${level >= 15 ? ` The attacker also takes 1d4 ${abilityMod >= 0 ? '+' : '−'} ${Math.abs(abilityMod)} Force damage.` : ''}`,
    });
  const currentHp =
    state.status === 'dead' ? 0 : Math.max(0, maxHp - state.damage);
  return {
    name: steel
      ? 'Steel Defender'
      : `Beast of the ${sky ? 'Sky' : sea ? 'Sea' : 'Land'}`,
    source: steel ? 'EFA' : 'XPHB',
    version: 1,
    eligible: level >= 3,
    class_level: level,
    size: sky ? 'Small' : 'Medium',
    type: steel ? 'Construct' : 'Beast',
    alignment: steel ? undefined : 'Neutral',
    armor_class: (steel ? 12 : 13) + abilityMod,
    max_hp: maxHp,
    current_hp: currentHp,
    hit_die: sky ? 6 : 8,
    hit_dice: level,
    ability_scores: abilities,
    saving_throws: Object.fromEntries(
      Object.entries(abilities).map(([key, score]) => [
        key,
        abilityModifier(score) + pb,
      ]),
    ),
    check_bonus: pb,
    passive_perception: 10 + abilityModifier(abilities.wisdom) + pb,
    speed: steel
      ? { walk: 40 }
      : sky
        ? { walk: 10, fly: 60 }
        : sea
          ? { walk: 5, swim: 60 }
          : { walk: 40, climb: 40 },
    darkvision: sea ? 90 : 60,
    languages: 'Understands the owner’s languages',
    damage_immunities: steel ? ['Poison'] : [],
    condition_immunities: steel ? ['Charmed', 'Exhaustion', 'Poisoned'] : [],
    traits,
    actions,
    command: {
      timing: 'owner_turn' as const,
      defaultAction: 'dodge',
      replaceAttack: !steel || level >= 5,
      exceptionalTraining: !steel && level >= 7,
    },
  };
}
