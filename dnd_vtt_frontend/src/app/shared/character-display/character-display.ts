import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Character, Ability, ABILITIES, ABILITY_SHORT, SKILLS } from '../../core/models/character.model';
import { ContentService, DndClass, DndRace, DndBackground } from '../../core/services/content.service';
import { CharacterStatsService } from '../../core/services/character-stats.service';

const ORDINALS = ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];

function toIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-character-display',
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './character-display.html',
})
export class CharacterDisplayComponent implements OnInit {
  readonly char = inject<{ character: Character }>(MAT_DIALOG_DATA).character;
  private content = inject(ContentService);
  private statsService = inject(CharacterStatsService);

  classData = signal<DndClass | null>(null);
  raceData  = signal<DndRace | null>(null);
  bgData    = signal<DndBackground | null>(null);
  loading   = signal(true);

  readonly abilities     = ABILITIES;
  readonly abilityShort: Record<string, string> = ABILITY_SHORT;
  readonly skillList     = Object.keys(SKILLS);
  readonly skillAbility: Record<string, string> = SKILLS;

  stats = computed(() =>
    this.statsService.compute(this.char, this.classData(), this.raceData()),
  );

  async ngOnInit() {
    const [cls, race, bg] = await Promise.allSettled([
      this.content.getClass(toIndex(this.char.class)),
      this.content.getRace(toIndex(this.char.race)),
      this.content.getBackground(toIndex(this.char.background)),
    ]);
    if (cls.status  === 'fulfilled') this.classData.set(cls.value  as DndClass);
    if (race.status === 'fulfilled') this.raceData.set(race.value  as DndRace);
    if (bg.status   === 'fulfilled') this.bgData.set(bg.value      as DndBackground);
    this.loading.set(false);
  }

  fmt(n: number): string { return this.statsService.fmt(n); }

  private currentLvl() {
    return this.classData()?.levels.find(l => l.level === this.char.level) ?? null;
  }

  classFeatures(): { level: number; name: string; subclass: boolean }[] {
    const cls = this.classData();
    if (!cls) return [];
    const sub = cls.subclasses.find(
      s => s.name === this.char.subclass || s.index === toIndex(this.char.subclass ?? ''),
    );
    const subLevelSet = new Set(sub?.levels.map(l => l.level) ?? []);
    const out: { level: number; name: string; subclass: boolean }[] = [];
    for (const lvl of cls.levels) {
      if (lvl.level > this.char.level) break;
      for (const f of lvl.features) {
        if (!f) continue;
        const isPlaceholder = sub && subLevelSet.has(lvl.level) && /feature$/i.test(f);
        if (!isPlaceholder) out.push({ level: lvl.level, name: f, subclass: false });
      }
      if (sub) {
        const sl = sub.levels.find(l => l.level === lvl.level);
        if (sl) sl.features.forEach(f => out.push({ level: lvl.level, name: f, subclass: true }));
      }
    }
    return out;
  }

  spellSlots(): { label: string; count: number; used: number }[] {
    const lvl = this.currentLvl();
    if (!lvl?.spell_slots) return [];
    return Object.entries(lvl.spell_slots)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => ({
        label: ORDINALS[+k] ?? `${k}th`,
        count: n,
        used: this.char.spell_slots_used?.[k] ?? 0,
      }));
  }

  pactMagic() { return this.currentLvl()?.pact_magic ?? null; }

  classSpecific(): { label: string; value: string }[] {
    const lvl = this.currentLvl();
    if (!lvl?.class_specific) return [];
    const LABELS: Record<string, string> = {
      rages: 'Rages/day', rage_damage: 'Rage Dmg Bonus',
      ki_points: 'Ki Points', martial_arts: 'Martial Arts Die',
      unarmored_movement_bonus: 'Unarmored Move +',
      sneak_attack: 'Sneak Attack', sorcery_points: 'Sorcery Points',
      invocations_known: 'Invocations Known',
    };
    return Object.entries(lvl.class_specific).map(([k, v]) => ({
      label: LABELS[k] ?? k,
      value: k === 'rages' && v === -1 ? '∞' : String(v),
    }));
  }

  hpPercent(): number {
    return !this.char.max_hp ? 0 : Math.round((this.char.current_hp / this.char.max_hp) * 100);
  }

  hpColor(): string {
    const pct = this.hpPercent();
    return pct <= 25 ? 'bg-danger' : pct <= 50 ? 'bg-yellow-500' : 'bg-success';
  }
}
