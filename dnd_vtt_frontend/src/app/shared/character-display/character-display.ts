import { Component, inject, signal, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Character, Ability, ABILITIES, ABILITY_SHORT, abilityModifier } from '../../core/models/character.model';
import { ContentService, DndClass, DndRace, DndBackground } from '../../core/services/content.service';

const SKILL_ABILITY: Record<string, string> = {
  'Acrobatics': 'dexterity',    'Animal Handling': 'wisdom',  'Arcana': 'intelligence',
  'Athletics': 'strength',       'Deception': 'charisma',      'History': 'intelligence',
  'Insight': 'wisdom',           'Intimidation': 'charisma',   'Investigation': 'intelligence',
  'Medicine': 'wisdom',          'Nature': 'intelligence',      'Perception': 'wisdom',
  'Performance': 'charisma',     'Persuasion': 'charisma',     'Religion': 'intelligence',
  'Sleight of Hand': 'dexterity','Stealth': 'dexterity',       'Survival': 'wisdom',
};
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

  classData  = signal<DndClass | null>(null);
  raceData   = signal<DndRace | null>(null);
  bgData     = signal<DndBackground | null>(null);
  loading    = signal(true);

  readonly abilities    = ABILITIES;
  readonly abilityShort: Record<string, string> = ABILITY_SHORT;
  readonly skillList    = Object.keys(SKILL_ABILITY);
  readonly skillAbility = SKILL_ABILITY;

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

  scores(): Record<Ability, number> {
    return (this.char.ability_scores ?? {}) as Record<Ability, number>;
  }

  mod(ability: Ability): number {
    return abilityModifier(this.scores()[ability] ?? 10);
  }

  fmt(n: number): string { return n >= 0 ? `+${n}` : `${n}`; }

  saveProficient(ability: string): boolean {
    return this.classData()?.saving_throws.includes(ability) ?? false;
  }

  saveBonus(ability: Ability): number {
    return this.mod(ability) + (this.saveProficient(ability) ? this.char.proficiency_bonus : 0);
  }

  skillProf(skill: string): boolean { return !!(this.char.skills ?? {})[skill]; }

  skillBonus(skill: string): number {
    return this.mod(SKILL_ABILITY[skill] as Ability) + (this.skillProf(skill) ? this.char.proficiency_bonus : 0);
  }

  initiative():        number { return this.mod('dexterity'); }
  passivePerception(): number { return 10 + this.skillBonus('Perception'); }

  private currentLvl() {
    return this.classData()?.levels.find(l => l.level === this.char.level) ?? null;
  }

  classFeatures(): { level: number; name: string; subclass: boolean }[] {
    const cls = this.classData();
    if (!cls) return [];
    const sub = cls.subclasses.find(
      s => s.name === this.char.subclass || s.index === toIndex(this.char.subclass ?? '')
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

  spellSlots(): { label: string; count: number }[] {
    const lvl = this.currentLvl();
    if (!lvl?.spell_slots) return [];
    return Object.entries(lvl.spell_slots)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => ({ label: ORDINALS[+k] ?? `${k}th`, count: n }));
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
    if (!this.char.max_hp) return 0;
    return Math.round((this.char.current_hp / this.char.max_hp) * 100);
  }

  hpColor(): string {
    const pct = this.hpPercent();
    if (pct <= 25) return 'bg-danger';
    if (pct <= 50) return 'bg-yellow-500';
    return 'bg-success';
  }
}
