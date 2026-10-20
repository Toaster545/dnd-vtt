import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { Character, EquipmentEntry } from '../../../core/models/character.model';
import { CharacterService, InventoryOptions, InventoryPlan } from '../../../core/services/character.service';
import { DndItem, itemDisplayName } from '../../../core/services/content.service';
import { ConfirmService } from '../../confirm.service';

@Component({
  selector: 'app-magic-inventory', imports: [FormsModule, A11yModule],
  templateUrl: './magic-inventory.html', styleUrl: './magic-inventory.scss',
})
export class MagicInventoryComponent {
  character = input.required<Character>();
  items = input<DndItem[]>([]);
  isDm = input(false);
  canBond = input(false);
  bond = output<EquipmentEntry>();
  restOnly = input(false);
  saved = output<Character>();
  closed = output<void>();
  private api = inject(CharacterService);
  private confirm = inject(ConfirmService);
  options = signal<InventoryOptions | null>(null);
  busy = signal(false);
  error = signal('');
  search = signal('');
  editingRest = signal(false);
  correction = signal(false);
  selections = signal<Record<string, { baseItemIndex?: string; attune?: boolean }>>({});
  toolsConfirmed = signal(false);
  requestId = crypto.randomUUID();
  repairs: Record<string, string> = {};
  targets: Record<string, string> = {};
  recovery: Record<string, number> = {};
  rows = computed(() => this.character().equipment.map(entry => ({ entry, item: entry.resolvedItem ?? this.items().find(i => i.index === entry.itemIndex) }))
    .filter(row => row.entry.name.toLowerCase().includes(this.search().toLowerCase())));
  active = computed(() => this.character().replicated_items ?? []);
  externalAttunements = computed(() => (this.character().attuned_items ?? []).filter(e => !this.character().equipment.some(held => held.instanceId === e.instanceId)));
  selectedCount = computed(() => Object.keys(this.selections()).length);
  constructor() {
    effect(() => {
      const id = this.character().id;
      if (id) void this.api.inventoryOptions(id).then(options => this.options.set(options)).catch(e => this.error.set(this.message(e)));
    });
    effect(() => { if (this.restOnly()) this.editingRest.set(true); });
  }
  private message(e: unknown): string {
    return (e as { error?: { message?: string } })?.error?.message ?? 'Could not save inventory. Try again.';
  }
  async action(entry: EquipmentEntry, action: string, extra: Record<string, unknown> = {}) {
    if (!entry.instanceId || this.busy()) return;
    if (action === 'use' && entry.resolvedItem?.spell?.concentration && this.character().active_concentration) {
      if (!await this.confirm.confirm('This item casts a Concentration spell. End your current Concentration?', 'Replace Concentration')) return;
      extra['replaceConcentration'] = true;
    }
    this.busy.set(true); this.error.set('');
    try { this.saved.emit(await this.api.inventoryOperation(this.character().id!, entry.instanceId, { action, ...extra })); }
    catch (e) { this.error.set(this.message(e)); }
    finally { this.busy.set(false); }
  }
  async remove(entry: EquipmentEntry) {
    if (await this.confirm.confirm(`Remove ${entry.name}? Its effects and any replication link will end.`, 'Remove item')) await this.action(entry, 'remove');
  }
  async recover(entry: EquipmentEntry, item: DndItem) {
    if (await this.confirm.confirm(`Confirm that ${item.charges?.recovery} has occurred for ${entry.name}.`, 'Recover charges')) {
      await this.action(entry, 'recover', { event: item.charges?.recovery, amount: this.recovery[entry.instanceId!] });
    }
  }
  bases(entry: EquipmentEntry) {
    const filter = this.items().find(i => i.index === entry.itemIndex)?.variant?.baseFilter;
    return this.items().filter(i => i.type === 'weapon' && !i.rarity && !i.enhancement_bonus && !i.variant
      && (filter === 'weapon' || i.properties.some(p => p.startsWith(filter === 'thrown-weapon' ? 'Thrown' : 'Ammunition'))));
  }
  togglePlan(plan: InventoryPlan, selected: boolean) {
    this.selections.update(current => { const next = { ...current }; if (selected) next[plan.id] = {}; else delete next[plan.id]; return next; });
    this.requestId = crypto.randomUUID();
  }
  choose(plan: InventoryPlan, field: 'baseItemIndex' | 'attune', value: string | boolean) {
    this.selections.update(current => ({ ...current, [plan.id]: { ...current[plan.id], [field]: value } }));
    this.requestId = crypto.randomUUID();
  }
  planItem(plan: InventoryPlan) { return this.items().find(i => i.index === plan.itemIndex); }
  preview(plan: InventoryPlan) {
    const item = this.planItem(plan);
    const base = this.items().find(i => i.index === this.selections()[plan.id]?.baseItemIndex);
    return item?.variant && base ? `${item.variant.namePrefix ? item.variant.namePrefix + ' ' : ''}${base.name}${item.enhancement_bonus ? ' +' + item.enhancement_bonus : ''}` : item ? itemDisplayName(item) : plan.name;
  }
  replacements = computed(() => {
    const selections = this.selections();
    const explicit = this.active().filter(e => e.origin && selections[e.origin.planId]);
    const retained = this.active().filter(e => !explicit.includes(e)).sort((a,b) => (a.origin?.createdAt ?? '').localeCompare(b.origin?.createdAt ?? ''));
    const overflow = Math.max(0, retained.length + this.selectedCount() - (this.options()?.limit ?? 0));
    return [...explicit, ...retained.slice(0, overflow)];
  });
  begin(correction = false) {
    this.correction.set(correction); this.selections.set({}); this.toolsConfirmed.set(false);
    this.requestId = crypto.randomUUID(); this.editingRest.set(true);
  }
  cancel() { if (this.busy()) return; this.editingRest.set(false); this.closed.emit(); }
  async finish() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = await this.api.completeRest(this.character().id!, {
        requestId: this.requestId, correction: this.correction(), toolsConfirmed: this.toolsConfirmed(),
        creations: Object.entries(this.selections()).map(([planId, selection]) => ({ planId, ...selection })),
      });
      this.saved.emit(result); this.editingRest.set(false); this.closed.emit();
    } catch (e) { this.error.set(this.message(e)); }
    finally { this.busy.set(false); }
  }
}
