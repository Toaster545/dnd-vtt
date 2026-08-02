import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ContentService, DndClass, DndRace, DndBackground, DndItem, DndSpell, DndFeat, Subclass, TraitGrant, SpellSlots,
} from '../../../core/services/content.service';
import { CharacterService } from '../../../core/services/character.service';
import { CharacterStatsService } from '../../../core/services/character-stats.service';
import { CharacterActionsService, CharacterAction } from '../../../core/services/character-actions.service';
import {
  Character, ABILITIES, ABILITY_SHORT, SKILLS, EquipmentEntry, SpellEntry, Currency,
} from '../../../core/models/character.model';
import { adjustCurrency, CURRENCY_ORDER } from '../../../core/utils/currency';

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

  // Cantrips are always castable; leveled spells only once prepared — same rule the Spells tab's
  // prepare toggle exists to enforce.
  castableSpells = computed(() => this.knownSpells().filter(({ spell, entry }) => spell.level === 0 || entry.prepared));

  inventoryItems = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const items = this.itemsAll();
    return char.equipment.map(e => ({ entry: e, item: items.find(it => it.index === e.itemIndex) ?? null }));
  });

  spellcastingClass = computed(() => this.resolvedClasses().find(rc => !!rc.data.spellcasting_ability) ?? null);

  currentPactMagic = computed(() => {
    const rc = this.spellcastingClass();
    if (!rc) return null;
    return rc.data.levels.find(l => l.level === rc.level)?.pact_magic ?? null;
  });

  currentSpellSlots = computed<SpellSlots>(() => {
    const rc = this.spellcastingClass();
    if (!rc) return {};
    const level = rc.data.levels.find(l => l.level === rc.level);
    if (level?.spell_slots) return level.spell_slots;
    return level?.pact_magic
      ? { [String(level.pact_magic.slot_level)]: level.pact_magic.slots } as SpellSlots
      : {};
  });

  spellSlotLevels = computed(() => Object.entries(this.currentSpellSlots()).filter(([, n]) => (n ?? 0) > 0));

  knownSpells = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const all = this.spellsAll();
    return char.spells
      .map(entry => ({ entry, spell: all.find(sp => sp.index === entry.spellIndex) ?? null }))
      .filter((x): x is { entry: SpellEntry; spell: DndSpell } => !!x.spell)
      .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
  });

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
  // copy in place) — interactive actions (Use, Rest, equip/prepare toggles) save and emit the
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
    const restoresSlots = type === 'long_rest' || (type === 'short_rest' && !!this.currentPactMagic());
    this.persist({
      ...char,
      resource_uses: this.actionsService.rest(char.resource_uses ?? {}, this.actions(), type),
      spell_slots_used: restoresSlots ? {} : char.spell_slots_used,
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

  // Spells
  togglePrepared(entry: SpellEntry) {
    const char = this.localChar();
    if (!char) return;
    const spells = char.spells.map(s => s.spellIndex === entry.spellIndex ? { ...s, prepared: !s.prepared } : s);
    this.persist({ ...char, spells });
  }

  useSlot(level: string) {
    const char = this.localChar();
    if (!char) return;
    const used = char.spell_slots_used ?? {};
    const current = used[level] ?? 0;
    const max = this.currentSpellSlots()[level as keyof SpellSlots] ?? 0;
    if (current >= max) return;
    this.persist({ ...char, spell_slots_used: { ...used, [level]: current + 1 } });
  }

  restoreSlot(level: string) {
    const char = this.localChar();
    if (!char) return;
    const used = char.spell_slots_used ?? {};
    const current = used[level] ?? 0;
    if (current <= 0) return;
    this.persist({ ...char, spell_slots_used: { ...used, [level]: current - 1 } });
  }
}
