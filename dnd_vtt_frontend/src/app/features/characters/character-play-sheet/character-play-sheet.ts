import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ContentService, DndClass, DndRace, DndBackground, DndItem, DndSpell, DndFeat, Subclass, TraitGrant,
} from '../../../core/services/content.service';
import { CharacterService } from '../../../core/services/character.service';
import { CharacterStatsService } from '../../../core/services/character-stats.service';
import { CharacterActionsService, CharacterAction } from '../../../core/services/character-actions.service';
import {
  Character, ABILITIES, ABILITY_SHORT, SKILLS, EquipmentEntry, Currency,
} from '../../../core/models/character.model';
import { adjustCurrency, CURRENCY_ORDER } from '../../../core/utils/currency';
import { resolveCharacterFeatPicks } from '../../../core/utils/character-effects';
import { resolveBackgroundOriginFeat } from '../../../core/utils/background-origin-feat';
import {
  resolveSpellcasting, ResolvedSpellOrigin, ResolvedSpellSlotPool, ResolvedSpellCategory,
} from '../../../core/utils/spellcasting';

function toIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

interface ResolvedClass {
  name: string;
  data: DndClass;
  level: number;
  subclassName: string;
  subclass: Subclass | null;
  choices: Record<string, string[]>;
}

interface DisplayFeature {
  source: string;
  name: string;
  detail?: string;
}

interface DisplaySpell {
  spell: DndSpell;
  origin: ResolvedSpellOrigin;
}

type Tab = 'stats' | 'actions' | 'inventory' | 'spells';

@Component({
  selector: 'app-character-play-sheet',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './character-play-sheet.html',
  styleUrl: './character-play-sheet.scss',
})
export class CharacterPlaySheetComponent {
  private content        = inject(ContentService);
  private characterService = inject(CharacterService);
  private statsService    = inject(CharacterStatsService);
  private actionsService  = inject(CharacterActionsService);

  readonly character = input.required<Character>();
  readonly saved      = output<Character>();

  readonly abilities     = ABILITIES;
  readonly abilityShort  = ABILITY_SHORT;
  readonly skillList     = Object.keys(SKILLS);
  readonly skillAbility  = SKILLS;

  activeTab   = signal<Tab>('stats');
  loading     = signal(true);
  persisting  = signal(false);

  hpAdjustAmount  = signal<number>(0);
  currencyOrder   = CURRENCY_ORDER;
  currencyAdjustAmounts = signal<Record<keyof Currency, number>>({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  insufficientFundsDenom = signal<keyof Currency | null>(null);

  localChar       = signal<Character | null>(null);
  raceData        = signal<DndRace | null>(null);
  bgData          = signal<DndBackground | null>(null);
  itemsAll        = signal<DndItem[]>([]);
  spellsAll       = signal<DndSpell[]>([]);
  featsAll        = signal<DndFeat[]>([]);
  resolvedClasses = signal<ResolvedClass[]>([]);

  primaryClass = computed(() => this.resolvedClasses()[0]?.data ?? null);

  stats = computed(() => {
    const char = this.localChar();
    if (!char) return null;
    const classesForFeats = this.resolvedClasses().map(rc => ({ data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName }));
    return this.statsService.compute(
      char, this.primaryClass(), this.raceData(), this.featsAll(), classesForFeats, this.itemsAll(),
    );
  });

  actions = computed<CharacterAction[]>(() => {
    const char = this.localChar();
    if (!char) return [];
    const classes = this.resolvedClasses().map(rc => ({ data: rc.data, level: rc.level, subclass: rc.subclass }));
    return this.actionsService.compute(classes, char.resource_uses ?? {}, char.ability_scores);
  });

  // The four Actions-tab groups, in display order: weapon/spell attacks (below), then
  // trackable class features split by their action economy — "Other Actions" (activation
  // 'action'/'reaction') alongside the static reference lists below, then Bonus Actions, then
  // Special ("free" activation — resources like Action Surge that don't cost any action-economy
  // slot at all).
  otherResourceActions = computed(() => this.actions().filter(a => a.activation === 'action' || a.activation === 'reaction'));
  bonusActions         = computed(() => this.actions().filter(a => a.activation === 'bonus_action'));
  specialActions       = computed(() => this.actions().filter(a => a.activation === 'free'));

  // The standard PHB actions every character can always take — not class-specific data, so a
  // fixed reference list rather than something resolved from grants.
  readonly universalActions: DisplayFeature[] = [
    { source: 'Action', name: 'Dash', detail: 'Gain extra movement equal to your Speed.' },
    { source: 'Action', name: 'Disengage', detail: "Your movement doesn't provoke opportunity attacks for the rest of the turn." },
    { source: 'Action', name: 'Dodge', detail: 'Until your next turn, attack rolls against you have disadvantage (if you can see the attacker), and you make Dexterity saves with advantage.' },
    { source: 'Action', name: 'Help', detail: "Give an ally advantage on their next ability check for a task, or on their next attack against a creature within 5 ft. of you." },
    { source: 'Action', name: 'Hide', detail: 'Make a Dexterity (Stealth) check to become hidden.' },
    { source: 'Action', name: 'Ready', detail: 'Choose a trigger and an action or movement to take in response to it, using your reaction when it occurs.' },
    { source: 'Action', name: 'Search', detail: 'Make a Wisdom (Perception) or Intelligence (Investigation) check to find something.' },
    { source: 'Action', name: 'Use an Object', detail: 'Interact with a second object, or use an object that requires your action.' },
  ];

  // Weapons the character has actually chosen mastery for (across every weapon_mastery grant on
  // every selected class — the choice may be split across several levels, see fighter.json),
  // shown as a during-combat reference of the mastery property that triggers when they hit.
  masteredWeapons = computed<DisplayFeature[]>(() => {
    const items = this.itemsAll();
    const names = new Set<string>();
    for (const rc of this.resolvedClasses()) {
      const levels = [...rc.data.levels, ...(rc.subclass?.levels ?? [])];
      for (const grant of levels.flatMap(l => l.grants ?? [])) {
        if (grant.type !== 'weapon_mastery') continue;
        for (const name of rc.choices[grant.key] ?? []) names.add(name);
      }
    }
    return [...names]
      .map(name => items.find(it => it.name === name && it.mastery))
      .filter((it): it is DndItem => !!it)
      .map(it => ({ source: 'Weapon Mastery', name: `${it.name} — ${it.mastery!.property}`, detail: it.mastery!.description }));
  });

  inventoryItems = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const items = this.itemsAll();
    return char.equipment.map(e => ({ entry: e, item: items.find(it => it.index === e.itemIndex) ?? null }));
  });

  spellResolution = computed(() => {
    const char = this.localChar();
    if (!char) return null;
    const race = this.raceData();
    const background = this.bgData();
    const subrace = race && char.subrace ? race.subraces.find(candidate => candidate.name === char.subrace) ?? null : null;
    const featSelections = resolveCharacterFeatPicks(
      this.resolvedClasses().map(rc => ({
        data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName,
      })),
      this.featsAll(),
      race ? { data: race, choices: char.race_choices ?? {}, subrace: char.subrace } : null,
    );
    const originFeat = resolveBackgroundOriginFeat(background, this.featsAll());
    if (background && originFeat) {
      const list = background.feature.match(/\((Cleric|Druid|Wizard)\)/i)?.[1];
      featSelections.push({
        feat: originFeat,
        scope: `background:${background.index}:origin`,
        choices: {
          ...(char.background_choices ?? {}),
          ...(list ? { magic_initiate_list: [list] } : {}),
        },
      });
    }
    return resolveSpellcasting({
      characterLevel: char.level,
      abilityScores: char.ability_scores,
      spells: this.spellsAll(),
      classes: this.resolvedClasses().map(rc => ({
        cls: rc.data,
        level: rc.level,
        subclass: rc.subclassName,
        choices: rc.choices,
      })),
      race: race ? { race, subrace, choices: char.race_choices ?? {} } : null,
      background: background ? { background, choices: char.background_choices ?? {} } : null,
      feats: featSelections,
      spellChoices: char.spell_choices ?? {},
    });
  });

  spellRows = computed<DisplaySpell[]>(() => {
    const resolution = this.spellResolution();
    if (!resolution) return [];
    const spellByIndex = new Map(this.spellsAll().map(spell => [spell.index, spell]));
    const rows = new Map<string, DisplaySpell>();
    const priority = { known: 0, spellbook: 1, prepared: 2, always_prepared: 3 } as const;
    for (const origin of [
      ...resolution.known,
      ...resolution.spellbook,
      ...resolution.prepared,
      ...resolution.alwaysPrepared,
    ]) {
      const spell = spellByIndex.get(origin.spellIndex);
      if (!spell) continue;
      const key = `${origin.sourceKey}:${origin.spellIndex}`;
      const current = rows.get(key);
      if (!current || priority[origin.category] > priority[current.origin.category]) rows.set(key, { spell, origin });
    }
    return [...rows.values()].sort((a, b) =>
      a.origin.sourceName.localeCompare(b.origin.sourceName)
      || a.spell.level - b.spell.level
      || a.spell.name.localeCompare(b.spell.name));
  });

  castableSpells = computed(() => this.spellRows().filter(row => row.origin.category !== 'spellbook'));

  resolvedFeatures = computed<DisplayFeature[]>(() => {
    const char = this.localChar();
    if (!char) return [];
    const out: DisplayFeature[] = [];

    const race = this.raceData();
    if (race) {
      const raceChoices = char.race_choices ?? {};
      for (const grant of this.grantsOrLegacy(race.grants, race.traits)) {
        out.push(...this.describeGrant(grant, raceChoices, race.name));
      }
      const sub = char.subrace ? race.subraces.find(s => s.name === char.subrace) : null;
      if (sub) {
        for (const grant of this.grantsOrLegacy(sub.grants, sub.traits)) {
          out.push(...this.describeGrant(grant, raceChoices, sub.name));
        }
      }
    }

    for (const rc of this.resolvedClasses()) {
      const source = rc.subclassName ? `${rc.name} (${rc.subclassName})` : rc.name;
      const levels = [...rc.data.levels, ...(rc.subclass?.levels ?? [])];
      for (const lvl of levels) {
        if (lvl.level > rc.level) continue;
        if (lvl.grants?.length) {
          for (const grant of lvl.grants) out.push(...this.describeGrant(grant, rc.choices, source));
        } else {
          for (const f of lvl.features) out.push({ source, name: f });
        }
      }
    }

    return out;
  });

  private grantsOrLegacy(grants: TraitGrant[] | undefined, traits: string[]): TraitGrant[] {
    return grants?.length ? grants : traits.map(name => ({ type: 'feature', name }) as TraitGrant);
  }

  private describeGrant(grant: TraitGrant, choices: Record<string, string[]>, source: string): DisplayFeature[] {
    switch (grant.type) {
      case 'feature':
        return [{ source, name: grant.name, detail: grant.description }];
      case 'choice':
      case 'skill_choice':
      case 'weapon_mastery': {
        const picked = choices[grant.key] ?? [];
        if (!picked.length) return [];
        return [{ source, name: grant.name, detail: picked.join(', ') }];
      }
      case 'ability_choice': {
        const featIndex = grant.allowFeat ? choices[`${grant.key}:feat`]?.[0] : undefined;
        if (featIndex) {
          const feat = this.featsAll().find(f => f.index === featIndex);
          return feat ? [{ source, name: feat.name, detail: feat.description }] : [];
        }
        const picked = choices[grant.key] ?? [];
        if (!picked.length) return [];
        const counts = new Map<string, number>();
        for (const a of picked) counts.set(a, (counts.get(a) ?? 0) + 1);
        const detail = [...counts.entries()]
          .map(([a, n]) => `+${n} ${a.charAt(0).toUpperCase()}${a.slice(1)}`)
          .join(', ');
        return [{ source, name: grant.name, detail }];
      }
      case 'feat_pick': {
        return (choices[grant.key] ?? [])
          .map(index => this.featsAll().find(feat => feat.index === index))
          .filter((feat): feat is DndFeat => !!feat)
          .map(feat => ({ source, name: feat.name, detail: feat.description }));
      }
      default:
        return [];
    }
  }

  // Distinguishes "a different character was picked" (reload content, reset to Stats tab)
  // from "the same character came back down after a save round-trip" (just refresh the local
  // copy in place) — interactive actions (Use, Rest, equip/slot toggles) save and emit the
  // updated character back through the parent, which re-feeds it into this same input.
  private loadedId: string | null | undefined = undefined;

  constructor() {
    effect(() => {
      const char = this.character();
      if (char.id !== this.loadedId) {
        this.loadedId = char.id;
        this.activeTab.set('stats');
        this.load(char);
      } else {
        this.localChar.set(char);
      }
    });
  }

  private async load(char: Character) {
    this.loading.set(true);
    this.localChar.set(char);

    const classEntries = char.classes?.length
      ? char.classes
      : (char.class ? [{ name: char.class, level: char.level, subclass: char.subclass, choices: {} as Record<string, string[]> }] : []);

    const [race, bg, items, spells, feats] = await Promise.all([
      char.race ? this.content.getRace(toIndex(char.race)).catch(() => null) : Promise.resolve(null),
      char.background ? this.content.getBackground(toIndex(char.background)).catch(() => null) : Promise.resolve(null),
      this.content.getItems(),
      this.content.getSpells(),
      this.content.getFeats(),
    ]);

    const classDataList = await Promise.all(classEntries.map(c => this.content.getClass(toIndex(c.name)).catch(() => null)));

    const resolved: ResolvedClass[] = classEntries
      .map((c, i) => {
        const data = classDataList[i];
        if (!data) return null;
        const subclass = c.subclass ? data.subclasses.find(s => s.name === c.subclass) ?? null : null;
        return { name: c.name, data, level: c.level, subclassName: c.subclass ?? '', subclass, choices: c.choices ?? {} };
      })
      .filter((c): c is ResolvedClass => c !== null);

    this.raceData.set(race);
    this.bgData.set(bg);
    this.itemsAll.set(items);
    this.spellsAll.set(spells);
    this.featsAll.set(feats);
    this.resolvedClasses.set(resolved);
    this.loading.set(false);
  }

  // char.armor_class is a stored field, not derived (see character.model.ts) — everywhere outside
  // this sheet (campaign hub, encounter roster) reads it directly, so a stale value there would
  // sit at whatever the wizard last set regardless of what's actually equipped now. Keep it in
  // sync with the same live formula the sheet itself displays (`stats().computed_ac`) every time
  // something is persisted, not just on equip toggles — cheap, and never wrong.
  private computeArmorClass(char: Character): number {
    const classesForFeats = this.resolvedClasses().map(rc => ({ data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName }));
    return this.statsService.compute(
      char, this.primaryClass(), this.raceData(), this.featsAll(), classesForFeats, this.itemsAll(),
    ).computed_ac;
  }

  private async persist(next: Character) {
    const withAc = { ...next, armor_class: this.computeArmorClass(next) };
    this.localChar.set(withAc);
    this.persisting.set(true);
    try {
      const result = await this.characterService.saveCharacter(withAc);
      this.localChar.set(result);
      this.saved.emit(result);
    } finally {
      this.persisting.set(false);
    }
  }

  fmt(n: number): string {
    return this.statsService.fmt(n);
  }

  slotLevels(pool: ResolvedSpellSlotPool): [string, number][] {
    return Object.entries(pool.slots).filter(([, count]) => count > 0);
  }

  spellCategoryLabel(category: ResolvedSpellCategory): string {
    return {
      known: 'Known',
      spellbook: 'Spellbook',
      prepared: 'Prepared',
      always_prepared: 'Always Prepared',
    }[category];
  }

  hpPercent(char: Character): number {
    return !char.max_hp ? 0 : Math.round((char.current_hp / char.max_hp) * 100);
  }

  hpColor(char: Character): string {
    const pct = this.hpPercent(char);
    return pct <= 25 ? 'bg-danger' : pct <= 50 ? 'bg-yellow-500' : 'bg-success';
  }

  setHpAdjustAmount(value: string) {
    this.hpAdjustAmount.set(Math.max(0, Math.floor(+value || 0)));
  }

  // Damage (negative delta) or healing (positive delta), clamped to [0, max_hp] — current_hp
  // can't go negative (that's what death saves track) or overheal past max.
  applyHpDelta(delta: number) {
    const char = this.localChar();
    if (!char || !delta) return;
    const next = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
    if (next === char.current_hp) return;
    this.persist({ ...char, current_hp: next });
  }

  // Actions
  useAction(action: CharacterAction) {
    const char = this.localChar();
    if (!char) return;
    this.persist({ ...char, resource_uses: this.actionsService.use(char.resource_uses ?? {}, action) });
  }

  restoreAction(action: CharacterAction) {
    const char = this.localChar();
    if (!char) return;
    this.persist({ ...char, resource_uses: this.actionsService.restore(char.resource_uses ?? {}, action) });
  }

  rest(type: 'short_rest' | 'long_rest') {
    const char = this.localChar();
    if (!char) return;
    const slotUses: NonNullable<Character['spell_slot_uses']> = type === 'long_rest'
      ? {}
      : { ...(char.spell_slot_uses ?? {}) };
    if (type === 'short_rest') {
      for (const pool of this.spellResolution()?.slotPools.filter(candidate => candidate.type === 'pact') ?? []) {
        slotUses[pool.key] = {};
      }
    }
    this.persist({
      ...char,
      resource_uses: this.actionsService.rest(char.resource_uses ?? {}, this.actions(), type),
      spell_slots_used: type === 'long_rest' ? {} : char.spell_slots_used,
      spell_slot_uses: slotUses,
    });
  }

  // Inventory
  toggleEquipped(entry: EquipmentEntry) {
    const char = this.localChar();
    if (!char) return;
    const equipment = char.equipment.map(e => e.itemIndex === entry.itemIndex ? { ...e, equipped: !e.equipped } : e);
    this.persist({ ...char, equipment });
  }

  setCurrencyAdjustAmount(denom: keyof Currency, value: string) {
    this.currencyAdjustAmounts.update(amounts => ({ ...amounts, [denom]: Math.max(0, Math.floor(+value || 0)) }));
  }

  // Adding is always safe; removing more than is on hand of one denomination auto-calibrates by
  // breaking higher denominations (see adjustCurrency) and fails only if the whole purse can't
  // cover the withdrawal, in which case we flash a brief "insufficient funds" indicator instead.
  applyCurrencyDelta(denom: keyof Currency, sign: 1 | -1) {
    const char = this.localChar();
    const amount = this.currencyAdjustAmounts()[denom];
    if (!char || !amount) return;
    const next = adjustCurrency(char.currency, denom, sign * amount);
    if (!next) {
      this.insufficientFundsDenom.set(denom);
      setTimeout(() => this.insufficientFundsDenom.set(null), 1500);
      return;
    }
    this.persist({ ...char, currency: next });
  }

  slotUses(poolKey: string, level: string): number {
    const char = this.localChar();
    if (!char) return 0;
    return char.spell_slot_uses?.[poolKey]?.[level]
      ?? (poolKey === 'spellcasting' ? char.spell_slots_used?.[level] : 0)
      ?? 0;
  }

  useSlot(poolKey: string, level: string, max: number) {
    const char = this.localChar();
    if (!char) return;
    const current = this.slotUses(poolKey, level);
    if (current >= max) return;
    const poolUses = { ...(char.spell_slot_uses?.[poolKey] ?? {}), [level]: current + 1 };
    this.persist({
      ...char,
      spell_slot_uses: { ...(char.spell_slot_uses ?? {}), [poolKey]: poolUses },
      spell_slots_used: poolKey === 'spellcasting'
        ? { ...(char.spell_slots_used ?? {}), [level]: current + 1 }
        : char.spell_slots_used,
    });
  }

  restoreSlot(poolKey: string, level: string) {
    const char = this.localChar();
    if (!char) return;
    const current = this.slotUses(poolKey, level);
    if (current <= 0) return;
    const poolUses = { ...(char.spell_slot_uses?.[poolKey] ?? {}), [level]: current - 1 };
    this.persist({
      ...char,
      spell_slot_uses: { ...(char.spell_slot_uses ?? {}), [poolKey]: poolUses },
      spell_slots_used: poolKey === 'spellcasting'
        ? { ...(char.spell_slots_used ?? {}), [level]: current - 1 }
        : char.spell_slots_used,
    });
  }
}
