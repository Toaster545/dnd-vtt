import { Component, inject, signal, computed, output, input, OnInit, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { SpellService } from '../../../../core/services/spell.service';
import { DndSpell } from '../../../../core/services/content.service';

interface SubclassRow { class: string; subclass: string; }
interface ScalingRow { level: string; value: string; }

const SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

function tagsFrom(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// Values typed into `classes` must match existing SRD class names verbatim — spellcasting.ts's
// eligibility filter matches on that string, so a typo'd class name silently won't surface a
// custom spell in that class's spell picker.
@Component({
  selector: 'app-spell-form',
  imports: [FormsModule, MatIconModule],
  templateUrl: './spell-form.html',
})
export class SpellFormComponent implements OnInit {
  private spellService = inject(SpellService);

  readonly spell     = input<DndSpell | null>(null);
  // Set instead of `spell` to seed the form from an existing spell (official or homebrew)
  // without editing it — save() still creates a brand-new custom entry.
  readonly duplicateFrom = input<DndSpell | null>(null);
  readonly saved     = output<DndSpell>();
  readonly cancelled = output<void>();

  readonly isEdit = computed(() => this.spell() != null);
  readonly schools = SCHOOLS;

  private originalIndex: string | null = null;

  saving = signal(false);
  error  = signal<string | null>(null);

  name        = signal('');
  level       = signal(0);
  school      = signal('Evocation');
  castingTime = signal('1 action');
  range       = signal('');
  duration    = signal('');
  ritual        = signal(false);
  concentration = signal(false);

  componentV = signal(true);
  componentS = signal(true);
  componentM = signal(false);
  material         = signal('');
  materialCostCp   = signal<number | null>(null);
  materialConsumed = signal(false);

  classes      = signal('');
  species      = signal('');
  backgrounds  = signal('');
  feats        = signal('');
  otherOptions = signal('');
  subclasses   = signal<SubclassRow[]>([]);

  showAdvanced  = signal(false);
  savingThrows  = signal('');
  damageTypes   = signal('');
  areaTags      = signal('');
  miscTags      = signal('');
  scalingLabel  = signal('');
  scalingRows   = signal<ScalingRow[]>([]);

  description     = signal('');
  higherLevels    = signal('');
  cantripUpgrade  = signal('');

  readonly canSave = computed(() =>
    !!(this.name().trim() && this.school().trim() && this.castingTime().trim() &&
       this.range().trim() && this.duration().trim() && this.description().trim()));

  ngOnInit() {
    const editing = this.spell();
    const s = editing ?? this.duplicateFrom();
    if (!s) return;
    if (editing) this.originalIndex = editing.index;

    this.name.set(editing ? s.name : `Copy of ${s.name}`);
    this.level.set(s.level);
    this.school.set(s.school);
    this.castingTime.set(s.casting_time);
    this.range.set(s.range);
    this.duration.set(s.duration);
    this.ritual.set(s.ritual);
    this.concentration.set(s.concentration);

    this.componentV.set(s.components.includes('V'));
    this.componentS.set(s.components.includes('S'));
    this.componentM.set(s.components.includes('M'));
    this.material.set(s.material ?? '');
    this.materialCostCp.set(s.material_cost_cp ?? null);
    this.materialConsumed.set(!!s.material_consumed);

    this.classes.set((s.classes ?? []).join(', '));
    this.species.set((s.species ?? []).join(', '));
    this.backgrounds.set((s.backgrounds ?? []).join(', '));
    this.feats.set((s.feats ?? []).join(', '));
    this.otherOptions.set((s.other_options ?? []).join(', '));
    this.subclasses.set((s.subclasses ?? []).map(sc => ({ class: sc.class, subclass: sc.subclass })));

    const m = s.mechanics ?? ({} as DndSpell['mechanics']);
    this.savingThrows.set((m.saving_throws ?? []).join(', '));
    this.damageTypes.set((m.damage_types ?? []).join(', '));
    this.areaTags.set((m.area_tags ?? []).join(', '));
    this.miscTags.set((m.misc_tags ?? []).join(', '));
    if (m.scaling) {
      this.scalingLabel.set(m.scaling.label);
      this.scalingRows.set(Object.entries(m.scaling.values).map(([level, value]) => ({ level, value })));
    }
    this.showAdvanced.set(!!(this.savingThrows() || this.damageTypes() || this.areaTags() || this.miscTags() || m.scaling));

    this.description.set(s.description);
    this.higherLevels.set(s.higher_levels ?? '');
    this.cantripUpgrade.set(s.cantrip_upgrade ?? '');
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

  updateSubclass(i: number, patch: Partial<SubclassRow>) { this.updateAt(this.subclasses, i, patch); }
  addSubclass() { this.addTo(this.subclasses, { class: '', subclass: '' }); }
  removeSubclass(i: number) { this.removeAt(this.subclasses, i); }

  updateScalingRow(i: number, patch: Partial<ScalingRow>) { this.updateAt(this.scalingRows, i, patch); }
  addScalingRow() { this.addTo(this.scalingRows, { level: '', value: '' }); }
  removeScalingRow(i: number) { this.removeAt(this.scalingRows, i); }

  private buildSpell(): Partial<Omit<DndSpell, 'index'>> {
    const components: string[] = [];
    if (this.componentV()) components.push('V');
    if (this.componentS()) components.push('S');
    if (this.componentM()) components.push('M');

    const scalingRows = this.scalingRows().filter(r => r.level.trim() && r.value.trim());

    const spell: Partial<Omit<DndSpell, 'index'>> = {
      name: this.name().trim(),
      level: this.level(),
      school: this.school(),
      casting_time: this.castingTime().trim(),
      range: this.range().trim(),
      components,
      duration: this.duration().trim(),
      ritual: this.ritual(),
      concentration: this.concentration(),
      classes: tagsFrom(this.classes()),
      species: tagsFrom(this.species()),
      backgrounds: tagsFrom(this.backgrounds()),
      feats: tagsFrom(this.feats()),
      other_options: tagsFrom(this.otherOptions()),
      subclasses: this.subclasses().filter(sc => sc.class.trim() && sc.subclass.trim()),
      mechanics: {
        saving_throws: tagsFrom(this.savingThrows()),
        ability_checks: [],
        damage_types: tagsFrom(this.damageTypes()),
        conditions: [],
        affects_creature_types: [],
        grants_damage_immunities: [],
        grants_damage_resistances: [],
        grants_damage_vulnerabilities: [],
        grants_condition_immunities: [],
        area_tags: tagsFrom(this.areaTags()),
        misc_tags: tagsFrom(this.miscTags()),
        ...(scalingRows.length && this.scalingLabel().trim() ? {
          scaling: {
            label: this.scalingLabel().trim(),
            values: Object.fromEntries(scalingRows.map(r => [r.level.trim(), r.value.trim()])),
          },
        } : {}),
      },
      description: this.description().trim(),
    };
    if (this.componentM()) {
      if (this.material().trim()) spell.material = this.material().trim();
      if (this.materialCostCp() != null) spell.material_cost_cp = this.materialCostCp()!;
      if (this.materialConsumed()) spell.material_consumed = true;
    }
    if (this.higherLevels().trim()) spell.higher_levels = this.higherLevels().trim();
    if (this.cantripUpgrade().trim()) spell.cantrip_upgrade = this.cantripUpgrade().trim();

    return spell;
  }

  async save() {
    if (this.saving() || !this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const built = this.buildSpell();
      const saved = this.isEdit()
        ? await this.spellService.updateSpell({ ...built, index: this.originalIndex! })
        : await this.spellService.createSpell(built);
      this.saved.emit(saved);
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Failed to save spell.';
      this.error.set(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      this.saving.set(false);
    }
  }
}
