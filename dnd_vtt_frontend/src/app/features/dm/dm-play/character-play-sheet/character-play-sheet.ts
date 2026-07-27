import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ContentService, DndClass, DndRace, DndBackground, DndItem, DndSpell, DndFeat, Subclass, TraitGrant, SpellSlots,
} from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterStatsService } from '../../../../core/services/character-stats.service';
import { CharacterActionsService, CharacterAction } from '../../../../core/services/character-actions.service';
import {
  Character, ABILITIES, ABILITY_SHORT, SKILLS, EquipmentEntry, SpellEntry,
} from '../../../../core/models/character.model';

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
  imports: [MatIconModule, MatTooltipModule],
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
    const classesForFeats = this.resolvedClasses().map(rc => ({ data: rc.data, choices: rc.choices }));
    return this.statsService.compute(
      char, this.primaryClass(), this.raceData(), this.featsAll(), classesForFeats, this.itemsAll(),
    );
  });

  actions = computed<CharacterAction[]>(() => {
    const char = this.localChar();
    if (!char) return [];
    const classes = this.resolvedClasses().map(rc => ({ data: rc.data, level: rc.level, subclass: rc.subclass }));
    return this.actionsService.compute(classes, char.resource_uses ?? {});
  });

  equippedWeapons = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const items = this.itemsAll();
    return char.equipment
      .filter(e => e.equipped)
      .map(e => items.find(it => it.index === e.itemIndex))
      .filter((it): it is DndItem => !!it && it.type === 'weapon');
  });

  inventoryItems = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const items = this.itemsAll();
    return char.equipment.map(e => ({ entry: e, item: items.find(it => it.index === e.itemIndex) ?? null }));
  });

  spellcastingClass = computed(() => this.resolvedClasses().find(rc => !!rc.data.spellcasting_ability) ?? null);

  currentSpellSlots = computed<SpellSlots>(() => {
    const rc = this.spellcastingClass();
    if (!rc) return {};
    return rc.data.levels.find(l => l.level === rc.level)?.spell_slots ?? {};
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

  private async persist(next: Character) {
    this.localChar.set(next);
    this.persisting.set(true);
    try {
      const result = await this.characterService.saveCharacter(next);
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
    this.persist({ ...char, resource_uses: this.actionsService.rest(char.resource_uses ?? {}, this.actions(), type) });
  }

  // Inventory
  toggleEquipped(entry: EquipmentEntry) {
    const char = this.localChar();
    if (!char) return;
    const equipment = char.equipment.map(e => e.itemIndex === entry.itemIndex ? { ...e, equipped: !e.equipped } : e);
    this.persist({ ...char, equipment });
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
