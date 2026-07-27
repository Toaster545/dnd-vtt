import { Component, input, output } from '@angular/core';
import { DndItem, EquipmentGroup, EquipmentItemRef, EquipmentOption, StartingEquipment } from '../../../../../../../../core/services/content.service';
import {
  categoryOptions, categoryPick, equipmentMode, groupOptionKey, isEquipmentComplete,
  resolveStartingEquipment, withCategoryPick, withGroupOption, withMode,
} from '../../../../../../../../core/utils/starting-equipment';

// One source's (class's or background's) "(a) gear or (b) gold" starting-equipment picker —
// rendered twice by the parent Equipment step, once per source, so the resolution logic and
// UI live in one place instead of being duplicated per-source.
@Component({
  selector: 'app-equipment-choice',
  templateUrl: './equipment-choice.html',
})
export class EquipmentChoiceComponent {
  readonly label   = input.required<string>();
  readonly equip   = input.required<StartingEquipment | null>();
  readonly items   = input.required<DndItem[]>();
  readonly choices = input<Record<string, string[]>>({});
  readonly changed = output<Record<string, string[]>>();

  mode(): 'gear' | 'gold' {
    return equipmentMode(this.choices());
  }

  setMode(mode: 'gear' | 'gold') {
    this.changed.emit(withMode(this.choices(), mode));
  }

  groupOption(group: EquipmentGroup): string | null {
    return groupOptionKey(this.choices(), group);
  }

  pickGroupOption(group: EquipmentGroup, optionKey: string) {
    this.changed.emit(withGroupOption(this.choices(), group, optionKey));
  }

  pickedOption(group: EquipmentGroup): EquipmentOption | null {
    const key = this.groupOption(group);
    return group.options.find(o => o.key === key) ?? null;
  }

  catPick(ref: EquipmentItemRef): string | null {
    return 'item' in ref ? null : categoryPick(this.choices(), ref);
  }

  pickCategory(ref: EquipmentItemRef, itemIndex: string) {
    if ('item' in ref) return;
    this.changed.emit(withCategoryPick(this.choices(), ref, itemIndex));
  }

  categoryChoices(ref: EquipmentItemRef): DndItem[] {
    return 'item' in ref ? [] : categoryOptions(this.items(), ref);
  }

  refLabel(ref: EquipmentItemRef): string {
    if ('item' in ref) return this.itemName(ref.item) + (ref.quantity && ref.quantity > 1 ? ` (${ref.quantity})` : '');
    return ref.label;
  }

  // Only category refs (e.g. "a Martial Weapon") need a secondary picker — this is the prompt
  // shown above it ("Choose a Martial Weapon:").
  categoryLabel(ref: EquipmentItemRef): string {
    return 'item' in ref ? '' : ref.label;
  }

  itemName(index: string): string {
    return this.items().find(it => it.index === index)?.name ?? index;
  }

  resolved() {
    const equip = this.equip();
    return equip ? resolveStartingEquipment(equip, this.choices()) : { items: [], gold: 0 };
  }

  complete(): boolean {
    const equip = this.equip();
    return !equip || isEquipmentComplete(equip, this.choices());
  }
}
