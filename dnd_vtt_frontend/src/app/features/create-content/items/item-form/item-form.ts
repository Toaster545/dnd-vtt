import { Component, inject, signal, computed, output, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../../core/services/item.service';
import { ActionActivation, DndItem, IconLibraryEntry } from '../../../../core/services/content.service';
import { IconPickerDialogComponent } from '../icon-picker-dialog/icon-picker-dialog';

const TYPES = ['weapon', 'armor', 'gear', 'consumable'];
const WEAPON_CATEGORIES = ['Simple Melee', 'Simple Ranged', 'Martial Melee', 'Martial Ranged'];
const ARMOR_CATEGORIES = ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'];
const GEAR_CATEGORIES = [
  'Adventuring Gear', 'Tool', 'Wondrous Item', 'Ring', 'Rod', 'Staff', 'Wand', 'Ammunition', 'Trade Good',
];
const CONSUMABLE_CATEGORIES = ['Potion', 'Scroll', 'Poison', 'Food & Drink'];
const CURRENCIES = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];
const DICE_COUNTS = [1, 2, 3, 4];
const DIE_FACES = ['4', '6', '8', '10', '12', '20'];
const MASTERY_PROPERTIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
// Weapon mastery properties are a fixed 2024-rules vocabulary with fixed rules text — the
// description is derived from the property, never freeform per-item.
const MASTERY_DESCRIPTIONS: Record<string, string> = {
  Cleave: "Hit lets you make a free attack against another creature within 5 ft. of the original target.",
  Graze: 'On a miss, you still deal damage to the target equal to your relevant ability modifier.',
  Nick: "The extra attack granted by this weapon's Light property doesn't require a bonus action.",
  Push: 'Hit pushes the target up to 10 ft. away from you.',
  Sap: "Hit gives the target disadvantage on its next attack roll before the start of your next turn.",
  Slow: "Hit reduces the target's speed by 10 ft. until the start of your next turn.",
  Topple: 'Hit can knock the target prone (target makes a Constitution save).',
  Vex: "Hit grants advantage on your next attack roll against that target before the end of your next turn.",
};
const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const CHARGE_RECOVERIES = ['dawn', 'short_rest', 'long_rest'] as const;
const ACTIVATIONS: ActionActivation[] = ['action', 'bonus_action', 'reaction', 'free'];

interface ItemActionEntry {
  key: string;
  name: string;
  description: string;
  activation: ActionActivation;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'action';
}

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
  imports: [FormsModule, MatIconModule, IconPickerDialogComponent],
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
  readonly rarities = RARITIES;
  readonly chargeRecoveries = CHARGE_RECOVERIES;
  readonly activations = ACTIVATIONS;
  readonly currencies = CURRENCIES;
  readonly isCombat = computed(() => this.type() === 'weapon' || this.type() === 'armor');

  private originalIndex: string | null = null;

  saving = signal(false);
  error  = signal<string | null>(null);

  name       = signal('');
  type       = signal('weapon');
  category   = signal('');
  categoryIsCustom = signal(false);
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
  costAmount = signal(0);
  costUnit   = signal<typeof CURRENCIES[number] | 'custom'>('gp');
  costCustom = signal('');
  description = signal('');

  hasMastery       = signal(false);
  masteryProperty    = signal('');
  readonly masteryDescription = computed(() => MASTERY_DESCRIPTIONS[this.masteryProperty()] ?? '');

  imageUrl       = signal<string | null>(null);
  uploadingImage = signal(false);
  imageError     = signal<string | null>(null);
  showIconPicker = signal(false);

  rarity           = signal('');
  requiresAttunement    = signal(false);
  attunementRestriction = signal('');
  hasCharges       = signal(false);
  chargesMax       = signal(1);
  chargesRecovery  = signal<typeof CHARGE_RECOVERIES[number] | 'custom'>('dawn');
  chargesRecoveryCustom = signal('');
  actions          = signal<ItemActionEntry[]>([]);

  readonly canSave = computed(() =>
    !!(this.name().trim() && this.type().trim() && this.category().trim() &&
       (this.costUnit() !== 'custom' || this.costCustom().trim()) &&
       (!this.hasCharges() || this.chargesRecovery() !== 'custom' || this.chargesRecoveryCustom().trim()) &&
       this.description().trim()));

  ngOnInit() {
    const editing = this.item();
    const i = editing ?? this.duplicateFrom();
    if (!i) return;
    if (editing) this.originalIndex = editing.index;

    this.name.set(editing ? i.name : `Copy of ${i.name}`);
    this.type.set(i.type);
    this.category.set(i.category);
    this.categoryIsCustom.set(!this.categoryOptions().includes(i.category));
    this.parseDamage(i.damage ?? '');
    this.damageType.set(i.damage_type ?? '');
    this.armorClass.set(i.armor_class ?? '');
    if (i.type === 'weapon') this.parseProperties(i.properties ?? []);
    else this.looseProperties.set((i.properties ?? []).join(', '));
    this.weight.set(i.weight);
    this.parseCost(i.cost);
    this.description.set(i.description);
    if (editing) this.imageUrl.set(i.image_url ?? null);

    if (i.mastery) {
      this.hasMastery.set(true);
      this.masteryProperty.set(i.mastery.property);
    }

    this.rarity.set(i.rarity ?? '');
    if (i.requires_attunement) {
      this.requiresAttunement.set(true);
      this.attunementRestriction.set(typeof i.requires_attunement === 'string' ? i.requires_attunement : '');
    }
    if (i.charges) {
      this.hasCharges.set(true);
      this.chargesMax.set(i.charges.max);
      if ((CHARGE_RECOVERIES as readonly string[]).includes(i.charges.recovery)) {
        this.chargesRecovery.set(i.charges.recovery as typeof CHARGE_RECOVERIES[number]);
      } else {
        this.chargesRecovery.set('custom');
        this.chargesRecoveryCustom.set(i.charges.recovery);
      }
    }
    this.actions.set((i.actions ?? []).map(a => ({
      key: a.key, name: a.name, description: a.description ?? '', activation: a.activation,
    })));
  }

  async onImageFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.originalIndex) return;
    this.uploadingImage.set(true);
    this.imageError.set(null);
    try {
      const updated = await this.itemService.uploadImage(this.originalIndex, file);
      this.imageUrl.set(updated.image_url ?? null);
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Failed to upload image.';
      this.imageError.set(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      this.uploadingImage.set(false);
    }
  }

  removeImage() {
    this.imageUrl.set(null);
  }

  onIconPicked(icon: IconLibraryEntry) {
    this.imageUrl.set(icon.url);
    this.showIconPicker.set(false);
  }

  addAction() {
    this.actions.update(list => [...list, { key: '', name: '', description: '', activation: 'action' }]);
  }
  removeAction(i: number) {
    this.actions.update(list => list.filter((_, idx) => idx !== i));
  }
  updateAction(i: number, patch: Partial<ItemActionEntry>) {
    this.actions.update(list => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  onTypeChange(next: string) {
    this.type.set(next);
    if (!this.categoryOptions().includes(this.category())) {
      this.category.set('');
      this.categoryIsCustom.set(false);
    }
  }

  categoryOptions(): string[] {
    switch (this.type()) {
      case 'weapon': return WEAPON_CATEGORIES;
      case 'armor': return ARMOR_CATEGORIES;
      case 'consumable': return CONSUMABLE_CATEGORIES;
      default: return GEAR_CATEGORIES;
    }
  }

  onCategorySelect(value: string) {
    if (value === 'custom') {
      this.categoryIsCustom.set(true);
      this.category.set('');
    } else {
      this.categoryIsCustom.set(false);
      this.category.set(value);
    }
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

  private parseCost(raw: string) {
    const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)$/i);
    if (m) {
      this.costAmount.set(+m[1]);
      this.costUnit.set(m[2].toLowerCase() as typeof CURRENCIES[number]);
    } else {
      this.costUnit.set('custom');
      this.costCustom.set(raw);
    }
  }

  private buildCost(): string {
    return this.costUnit() === 'custom' ? this.costCustom().trim() : `${this.costAmount()} ${this.costUnit()}`;
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
      cost: this.buildCost(),
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
    const imageUrl = this.imageUrl();
    if (imageUrl) built.image_url = imageUrl;
    if (this.rarity()) built.rarity = this.rarity();
    if (this.requiresAttunement()) {
      built.requires_attunement = this.attunementRestriction().trim() || true;
    }
    if (this.hasCharges()) {
      built.charges = {
        max: this.chargesMax(),
        recovery: this.chargesRecovery() === 'custom' ? this.chargesRecoveryCustom().trim() : this.chargesRecovery(),
      };
    }
    const actions = this.actions().filter(a => a.name.trim());
    if (actions.length) {
      built.actions = actions.map(a => ({
        key: a.key || slugify(a.name),
        name: a.name.trim(),
        description: a.description.trim() || undefined,
        activation: a.activation,
      }));
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
