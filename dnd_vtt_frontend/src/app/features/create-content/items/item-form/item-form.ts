import { Component, inject, signal, computed, output, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../../core/services/item.service';
import { DndItem } from '../../../../core/services/content.service';

const TYPES = ['weapon', 'armor', 'gear', 'consumable'];
const WEAPON_CATEGORIES = ['Simple Melee', 'Simple Ranged', 'Martial Melee', 'Martial Ranged'];
const ARMOR_CATEGORIES = ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'];
const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];
const DICE_COUNTS = [1, 2, 3, 4];
const DIE_FACES = ['4', '6', '8', '10', '12', '20'];
const MASTERY_PROPERTIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];

interface PropertyDef {
  key: string;
  // 'range' properties (Ammunition, Thrown) store a "short/long" range; 'die' properties
  // (Versatile) store the alternate damage die — both render as a suffix, e.g. "(range 30/120)".
  param?: 'range' | 'die';
}

const WEAPON_PROPERTIES: PropertyDef[] = [
  { key: 'Ammunition', param: 'range' },
  { key: 'Arcane Focus' },
  { key: 'Finesse' },
  { key: 'Heavy' },
  { key: 'Light' },
  { key: 'Loading' },
  { key: 'Reach' },
  { key: 'Special' },
  { key: 'Thrown', param: 'range' },
  { key: 'Two-Handed' },
  { key: 'Versatile', param: 'die' },
];

function tagsFrom(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

@Component({
  selector: 'app-item-form',
  imports: [FormsModule, MatIconModule],
  templateUrl: './item-form.html',
})
export class ItemFormComponent implements OnInit {
  private itemService = inject(ItemService);

  readonly item      = input<DndItem | null>(null);
  // Set instead of `item` to seed the form from an existing item (official or homebrew) without
  // editing it — save() still creates a brand-new custom entry.
  readonly duplicateFrom = input<DndItem | null>(null);
  readonly saved      = output<DndItem>();
  readonly cancelled  = output<void>();

  readonly isEdit = computed(() => this.item() != null);
  readonly types = TYPES;
  readonly weaponCategories = WEAPON_CATEGORIES;
  readonly armorCategories = ARMOR_CATEGORIES;
  readonly damageTypes = DAMAGE_TYPES;
  readonly diceCounts = DICE_COUNTS;
  readonly dieFaces = DIE_FACES;
  readonly masteryProperties = MASTERY_PROPERTIES;
  readonly weaponProperties = WEAPON_PROPERTIES;

  private originalIndex: string | null = null;

  saving = signal(false);
  error  = signal<string | null>(null);

  name       = signal('');
  type       = signal('weapon');
  category   = signal('');
  diceCount  = signal(1);
  // 'flat' means the weapon deals a fixed amount of damage with no die (e.g. a Blowgun's "1"),
  // stored via diceCount alone; otherwise this holds the die's face count ('4', '6', ...).
  dieFace    = signal('6');
  damageType = signal('');
  armorClass = signal('');
  selectedProperties = signal<Set<string>>(new Set());
  propertyParams      = signal<Record<string, string>>({});
  // Non-weapon items (armor, gear, consumables) describe their properties as free-form tags
  // (e.g. "Stealth Disadvantage", "Restores 2d4+2 HP") rather than the closed weapon vocabulary.
  looseProperties = signal('');
  weight     = signal(0);
  cost       = signal('');
  description = signal('');

  hasMastery       = signal(false);
  masteryProperty    = signal('');
  masteryDescription = signal('');

  readonly canSave = computed(() =>
    !!(this.name().trim() && this.type().trim() && this.category().trim() &&
       this.cost().trim() && this.description().trim()));

  ngOnInit() {
    const editing = this.item();
    const i = editing ?? this.duplicateFrom();
    if (!i) return;
    if (editing) this.originalIndex = editing.index;

    this.name.set(editing ? i.name : `Copy of ${i.name}`);
    this.type.set(i.type);
    this.category.set(i.category);
    this.parseDamage(i.damage ?? '');
    this.damageType.set(i.damage_type ?? '');
    this.armorClass.set(i.armor_class ?? '');
    if (i.type === 'weapon') this.parseProperties(i.properties ?? []);
    else this.looseProperties.set((i.properties ?? []).join(', '));
    this.weight.set(i.weight);
    this.cost.set(i.cost);
    this.description.set(i.description);

    if (i.mastery) {
      this.hasMastery.set(true);
      this.masteryProperty.set(i.mastery.property);
      this.masteryDescription.set(i.mastery.description);
    }
  }

  onTypeChange(next: string) {
    this.type.set(next);
    const validCategories = next === 'weapon' ? WEAPON_CATEGORIES : next === 'armor' ? ARMOR_CATEGORIES : null;
    if (validCategories && !validCategories.includes(this.category())) this.category.set('');
  }

  isPropertySelected(key: string): boolean {
    return this.selectedProperties().has(key);
  }

  toggleProperty(key: string) {
    const set = new Set(this.selectedProperties());
    if (set.has(key)) set.delete(key); else set.add(key);
    this.selectedProperties.set(set);
  }

  propertyParam(key: string): string {
    return this.propertyParams()[key] ?? '';
  }

  setPropertyParam(key: string, value: string) {
    this.propertyParams.update(p => ({ ...p, [key]: value }));
  }

  private parseDamage(raw: string) {
    const dice = raw.trim().match(/^(\d+)d(\d+)$/i);
    if (dice) {
      this.diceCount.set(+dice[1]);
      this.dieFace.set(dice[2]);
      return;
    }
    if (/^\d+$/.test(raw.trim())) {
      this.diceCount.set(+raw.trim());
      this.dieFace.set('flat');
    }
  }

  private parseProperties(raw: string[]) {
    const selected = new Set<string>();
    const params: Record<string, string> = {};
    for (const entry of raw) {
      const m = entry.match(/^(.+?)(?:\s*\(([^)]*)\))?$/);
      if (!m) continue;
      const base = m[1].trim();
      const paren = m[2]?.trim();
      const def = WEAPON_PROPERTIES.find(p => p.key.toLowerCase() === base.toLowerCase());
      if (!def) continue;
      selected.add(def.key);
      if (def.param === 'range' && paren) params[def.key] = paren.replace(/^range\s*/i, '');
      else if (def.param === 'die' && paren) params[def.key] = paren;
    }
    this.selectedProperties.set(selected);
    this.propertyParams.set(params);
  }

  private buildDamage(): string {
    return this.dieFace() === 'flat' ? String(this.diceCount()) : `${this.diceCount()}d${this.dieFace()}`;
  }

  private buildProperties(): string[] {
    const result: string[] = [];
    for (const def of WEAPON_PROPERTIES) {
      if (!this.selectedProperties().has(def.key)) continue;
      const param = this.propertyParams()[def.key]?.trim();
      if (def.param === 'range') result.push(param ? `${def.key} (range ${param})` : def.key);
      else if (def.param === 'die') result.push(param ? `${def.key} (${param})` : def.key);
      else result.push(def.key);
    }
    return result;
  }

  private buildItem(): Omit<DndItem, 'index'> {
    const built: Omit<DndItem, 'index'> = {
      name: this.name().trim(),
      type: this.type(),
      category: this.category().trim(),
      properties: this.type() === 'weapon' ? this.buildProperties() : tagsFrom(this.looseProperties()),
      weight: this.weight(),
      cost: this.cost().trim(),
      description: this.description().trim(),
    };
    if (this.type() === 'weapon') built.damage = this.buildDamage();
    if (this.damageType().trim()) built.damage_type = this.damageType().trim();
    if (this.armorClass().trim()) built.armor_class = this.armorClass().trim();
    if (this.hasMastery() && this.masteryProperty().trim()) {
      built.mastery = {
        property: this.masteryProperty().trim(),
        description: this.masteryDescription().trim(),
      };
    }
    return built;
  }

  async save() {
    if (this.saving() || !this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const built = this.buildItem();
      const saved = this.isEdit()
        ? await this.itemService.updateItem({ ...built, index: this.originalIndex! })
        : await this.itemService.createItem(built);
      this.saved.emit(saved);
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Failed to save item.';
      this.error.set(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      this.saving.set(false);
    }
  }
}
