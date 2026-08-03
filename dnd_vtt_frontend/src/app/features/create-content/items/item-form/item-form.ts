import { Component, inject, signal, computed, output, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../../core/services/item.service';
import { DndItem } from '../../../../core/services/content.service';

const TYPES = ['weapon', 'armor', 'gear', 'consumable'];

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

  private originalIndex: string | null = null;

  saving = signal(false);
  error  = signal<string | null>(null);

  name       = signal('');
  type       = signal('weapon');
  category   = signal('');
  damage     = signal('');
  damageType = signal('');
  armorClass = signal('');
  properties = signal('');
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
    this.damage.set(i.damage ?? '');
    this.damageType.set(i.damage_type ?? '');
    this.armorClass.set(i.armor_class ?? '');
    this.properties.set((i.properties ?? []).join(', '));
    this.weight.set(i.weight);
    this.cost.set(i.cost);
    this.description.set(i.description);

    if (i.mastery) {
      this.hasMastery.set(true);
      this.masteryProperty.set(i.mastery.property);
      this.masteryDescription.set(i.mastery.description);
    }
  }

  private buildItem(): Omit<DndItem, 'index'> {
    const built: Omit<DndItem, 'index'> = {
      name: this.name().trim(),
      type: this.type(),
      category: this.category().trim(),
      properties: tagsFrom(this.properties()),
      weight: this.weight(),
      cost: this.cost().trim(),
      description: this.description().trim(),
    };
    if (this.damage().trim()) built.damage = this.damage().trim();
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
