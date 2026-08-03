import { Component, inject, signal, computed, output, input, OnInit, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MonsterService } from '../../../../core/services/monster.service';
import { DndMonster } from '../../../../core/services/content.service';
import { EntryListComponent, StatBlockEntry } from './entry-list/entry-list';

interface AbilityBonus { ability: string; bonus: number; }
interface SkillBonus { skill: string; bonus: number; }

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function tagsFrom(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

@Component({
  selector: 'app-monster-form',
  imports: [FormsModule, MatIconModule, EntryListComponent],
  templateUrl: './monster-form.html',
})
export class MonsterFormComponent implements OnInit {
  private monsterService = inject(MonsterService);

  readonly monster   = input<DndMonster | null>(null);
  // Set instead of `monster` to seed the form from an existing monster (official or homebrew)
  // without editing it — save() still creates a brand-new custom entry.
  readonly duplicateFrom = input<DndMonster | null>(null);
  readonly saved     = output<DndMonster>();
  readonly cancelled = output<void>();

  readonly isEdit = computed(() => this.monster() != null);

  readonly sizes = SIZES;

  saving = signal(false);
  error  = signal<string | null>(null);

  name = signal('');
  // The server assigns a permanent `custom:<uuid>` index on create; we just carry it through on
  // edit so MonsterService.updateMonster knows which row to hit.
  private originalIndex: string | null = null;

  size      = signal('Medium');
  type      = signal('');
  alignment = signal('');
  color     = signal('#e74c3c');

  armorClass     = signal(10);
  armorClassDesc = signal('');
  hitPoints      = signal(10);
  hitDice        = signal('');

  speedWalk   = signal<number | null>(30);
  speedFly    = signal<number | null>(null);
  speedSwim   = signal<number | null>(null);
  speedClimb  = signal<number | null>(null);
  speedBurrow = signal<number | null>(null);

  strength     = signal(10);
  dexterity    = signal(10);
  constitution = signal(10);
  intelligence = signal(10);
  wisdom       = signal(10);
  charisma     = signal(10);

  savingThrows = signal<AbilityBonus[]>([]);
  skills       = signal<SkillBonus[]>([]);

  damageVulnerabilities = signal('');
  damageResistances     = signal('');
  damageImmunities      = signal('');
  conditionImmunities   = signal('');

  darkvision        = signal<number | null>(null);
  blindsight        = signal<number | null>(null);
  truesight         = signal<number | null>(null);
  tremorsense       = signal<number | null>(null);
  passivePerception = signal(10);

  languages       = signal('');
  challengeRating = signal('');
  xp              = signal(0);

  traits           = signal<StatBlockEntry[]>([]);
  actions          = signal<StatBlockEntry[]>([{ name: '', description: '' }]);
  reactions        = signal<StatBlockEntry[]>([]);
  legendaryActions = signal<StatBlockEntry[]>([]);

  description = signal('');

  readonly canSave = computed(() =>
    !!(this.name().trim() && this.type().trim() && this.alignment().trim() &&
       this.hitDice().trim() && this.challengeRating().trim() &&
       this.actions().some(a => a.name.trim())));

  ngOnInit() {
    const editing = this.monster();
    const m = editing ?? this.duplicateFrom();
    if (!m) return;
    if (editing) this.originalIndex = editing.index;

    this.name.set(editing ? m.name : `Copy of ${m.name}`);
    this.size.set(m.size);
    this.type.set(m.type);
    this.alignment.set(m.alignment);
    this.color.set(m.color ?? '#e74c3c');

    this.armorClass.set(m.armor_class);
    this.armorClassDesc.set(m.armor_class_desc ?? '');
    this.hitPoints.set(m.hit_points);
    this.hitDice.set(m.hit_dice);

    this.speedWalk.set(m.speed.walk ?? null);
    this.speedFly.set(m.speed.fly ?? null);
    this.speedSwim.set(m.speed.swim ?? null);
    this.speedClimb.set(m.speed.climb ?? null);
    this.speedBurrow.set(m.speed.burrow ?? null);

    this.strength.set(m.ability_scores.strength);
    this.dexterity.set(m.ability_scores.dexterity);
    this.constitution.set(m.ability_scores.constitution);
    this.intelligence.set(m.ability_scores.intelligence);
    this.wisdom.set(m.ability_scores.wisdom);
    this.charisma.set(m.ability_scores.charisma);

    this.savingThrows.set(Object.entries(m.saving_throws ?? {}).map(([ability, bonus]) => ({ ability, bonus })));
    this.skills.set(Object.entries(m.skills ?? {}).map(([skill, bonus]) => ({ skill, bonus })));

    this.damageVulnerabilities.set((m.damage_vulnerabilities ?? []).join(', '));
    this.damageResistances.set((m.damage_resistances ?? []).join(', '));
    this.damageImmunities.set((m.damage_immunities ?? []).join(', '));
    this.conditionImmunities.set((m.condition_immunities ?? []).join(', '));

    this.darkvision.set(m.senses.darkvision ?? null);
    this.blindsight.set(m.senses.blindsight ?? null);
    this.truesight.set(m.senses.truesight ?? null);
    this.tremorsense.set(m.senses.tremorsense ?? null);
    this.passivePerception.set(m.senses.passive_perception);

    this.languages.set((m.languages ?? []).join(', '));
    this.challengeRating.set(m.challenge_rating);
    this.xp.set(m.xp);

    this.traits.set(m.traits ?? []);
    this.actions.set(m.actions.length ? m.actions : [{ name: '', description: '' }]);
    this.reactions.set(m.reactions ?? []);
    this.legendaryActions.set(m.legendary_actions ?? []);

    this.description.set(m.description ?? '');
  }

  onNameChange(v: string) {
    this.name.set(v);
  }

  private updateAt<T>(list: WritableSignal<T[]>, i: number, patch: Partial<T>) {
    list.update(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  private addTo<T>(list: WritableSignal<T[]>, entry: T) {
    list.update(rows => [...rows, entry]);
  }
  private removeAt<T>(list: WritableSignal<T[]>, i: number) {
    list.update(rows => rows.filter((_, idx) => idx !== i));
  }

  updateSavingThrow(i: number, patch: Partial<AbilityBonus>) { this.updateAt(this.savingThrows, i, patch); }
  addSavingThrow() { this.addTo(this.savingThrows, { ability: '', bonus: 0 }); }
  removeSavingThrow(i: number) { this.removeAt(this.savingThrows, i); }

  updateSkill(i: number, patch: Partial<SkillBonus>) { this.updateAt(this.skills, i, patch); }
  addSkill() { this.addTo(this.skills, { skill: '', bonus: 0 }); }
  removeSkill(i: number) { this.removeAt(this.skills, i); }

  private buildMonster(): Omit<DndMonster, 'index'> {
    const speed: DndMonster['speed'] = {};
    if (this.speedWalk() != null) speed.walk = this.speedWalk()!;
    if (this.speedFly() != null) speed.fly = this.speedFly()!;
    if (this.speedSwim() != null) speed.swim = this.speedSwim()!;
    if (this.speedClimb() != null) speed.climb = this.speedClimb()!;
    if (this.speedBurrow() != null) speed.burrow = this.speedBurrow()!;

    const senses: DndMonster['senses'] = { passive_perception: this.passivePerception() };
    if (this.darkvision() != null) senses.darkvision = this.darkvision()!;
    if (this.blindsight() != null) senses.blindsight = this.blindsight()!;
    if (this.truesight() != null) senses.truesight = this.truesight()!;
    if (this.tremorsense() != null) senses.tremorsense = this.tremorsense()!;

    const savingThrows = Object.fromEntries(
      this.savingThrows().filter(s => s.ability.trim()).map(s => [s.ability.trim(), s.bonus]));
    const skills = Object.fromEntries(
      this.skills().filter(s => s.skill.trim()).map(s => [s.skill.trim(), s.bonus]));

    const monster: Omit<DndMonster, 'index'> = {
      name: this.name().trim(),
      size: this.size(),
      type: this.type().trim(),
      alignment: this.alignment().trim(),
      color: this.color(),
      armor_class: this.armorClass(),
      hit_points: this.hitPoints(),
      hit_dice: this.hitDice().trim(),
      speed,
      ability_scores: {
        strength: this.strength(), dexterity: this.dexterity(), constitution: this.constitution(),
        intelligence: this.intelligence(), wisdom: this.wisdom(), charisma: this.charisma(),
      },
      senses,
      languages: tagsFrom(this.languages()),
      challenge_rating: this.challengeRating().trim(),
      xp: this.xp(),
      actions: this.actions().filter(a => a.name.trim()),
    };
    if (this.armorClassDesc().trim()) monster.armor_class_desc = this.armorClassDesc().trim();
    if (Object.keys(savingThrows).length) monster.saving_throws = savingThrows;
    if (Object.keys(skills).length) monster.skills = skills;
    if (this.damageVulnerabilities().trim()) monster.damage_vulnerabilities = tagsFrom(this.damageVulnerabilities());
    if (this.damageResistances().trim()) monster.damage_resistances = tagsFrom(this.damageResistances());
    if (this.damageImmunities().trim()) monster.damage_immunities = tagsFrom(this.damageImmunities());
    if (this.conditionImmunities().trim()) monster.condition_immunities = tagsFrom(this.conditionImmunities());
    const traits = this.traits().filter(t => t.name.trim());
    if (traits.length) monster.traits = traits;
    const reactions = this.reactions().filter(t => t.name.trim());
    if (reactions.length) monster.reactions = reactions;
    const legendaryActions = this.legendaryActions().filter(t => t.name.trim());
    if (legendaryActions.length) monster.legendary_actions = legendaryActions;
    if (this.description().trim()) monster.description = this.description().trim();

    return monster;
  }

  async save() {
    if (this.saving() || !this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const built = this.buildMonster();
      const saved = this.isEdit()
        ? await this.monsterService.updateMonster({ ...built, index: this.originalIndex! })
        : await this.monsterService.createMonster(built);
      this.saved.emit(saved);
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Failed to save monster.';
      this.error.set(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      this.saving.set(false);
    }
  }
}
