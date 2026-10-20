import { CharacterService } from '../../../core/services/character.service';
import { environment } from '../../../../environments/environment';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyValuePipe, NgTemplateOutlet } from '@angular/common';
import { CompanionService } from '../../../core/services/companion.service';
import { Companion, CompanionAction, CompanionResponse } from '../../../core/models/companion.model';
import { getErrorMessage } from '../../../core/utils/error-message';

// Older server responses omit the presentation flag; their action keys are stable.
const BASIC_ACTION_KEYS = new Set(['dash', 'disengage', 'dodge', 'help', 'hide', 'search', 'ready']);

@Component({
  selector: 'app-companion-sheet', imports: [FormsModule, KeyValuePipe, NgTemplateOutlet],
  templateUrl: './companion-sheet.html',
  styleUrl: './companion-sheet.scss',
})
export class CompanionSheetComponent {
  private service = inject(CompanionService);
  private characters = inject(CharacterService);
  readonly characterId = input.required<string>();
  readonly selectedId = input<string | null>(null);
  readonly readonly = input(false);
  readonly changed = output<void>();
  data = signal<CompanionResponse | null>(null);
  error = signal(''); notice = signal(''); busy = signal(false);
  selected = signal<string | null>(null);
  companions = computed(() => this.data()?.companions ?? []);
  companion = computed(() => this.companions().find(c => c.id === (this.selectedId() ?? this.selected())) ?? this.companions()[0]);
  available = computed(() => (this.data()?.options ?? []).filter(o => !this.companions().some(c => c.kind === o.kind)));
  forms: Record<string, string> = {};
  amount = 1; tempHp = 0; newName = ''; conditions = ''; hitDice = 1; slotIndex = 0; replacementForm = '';
  actions = computed(() => this.companion()?.stats.actions.filter(a => a.activation === 'action') ?? []);
  specialActions = computed(() => this.actions().filter(a => !this.isBasicAction(a)));
  basicActions = computed(() => this.actions().filter(a => this.isBasicAction(a)));
  reactions = computed(() => this.companion()?.stats.actions.filter(a => a.activation === 'reaction') ?? []);
  commandName = computed(() => {
    const c = this.companion();
    return c?.stats.actions.find(a => a.key === c.turn?.command)?.name ?? 'Dodge';
  });
  constructor() {
    effect(onCleanup => {
      const id = this.characterId();
      this.data.set(null); this.error.set('');
      const sub = this.service.watch(id, err => this.error.set(getErrorMessage(err))).subscribe(data => this.accept(data));
      onCleanup(() => sub.unsubscribe());
    });
  }
  private accept(data: CompanionResponse) {
    const current = this.data();
    if (current && data.companions.some(c => c.revision < (current.companions.find(old => old.id === c.id)?.revision ?? 0))) return;
    this.data.set(data);
  }
  portraitUrl(path: string) { return `${environment.apiUrl.replace(/\/api\/?$/, '')}${path}`; }
  async uploadPortrait(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.readonly() || this.busy()) return;
    if (file.size > 2 * 1024 * 1024) { this.error.set('Choose an image smaller than 2 MB.'); return; }
    const c = this.companion(); if (!c) return;
    await this.run(async () => {
      const url = await this.characters.uploadPortrait(file);
      return this.service.update(this.characterId(), c.id, { action: 'portrait', portrait_image: url, revision: c.revision });
    });
  }
  trim = (value: string) => value.trim();
  preserveOrder = () => 0;
  correctionLabels: Record<string, string> = { command: 'command', actionUsed: 'action', bonusUsed: 'bonus action', reactionUsed: 'reaction', joltUsed: 'Arcane Jolt' };
  nonempty = (value: string) => !!value;
  private isBasicAction(action: CompanionAction) { return action.basic ?? BASIC_ACTION_KEYS.has(action.key); }
  modifier(n: number) { return Math.floor((n - 10) / 2); }
  signed(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
  async create(kind: string, fallback: string) {
    await this.run(() => this.service.create(this.characterId(), { kind, form: this.forms[kind] ?? fallback }));
  }
  async mutate(action: string, body: Record<string, unknown> = {}) {
    const c = this.companion(); if (!c) return;
    await this.run(() => this.service.update(this.characterId(), c.id, { ...body, action, revision: c.revision }));
  }
  async command(entry: CompanionAction, cost = 'bonus_action') {
    await this.mutate('command', { command: entry.key, cost });
  }
  async restore(action: 'replace' | 'revive') {
    const c = this.companion(); if (!c) return;
    const slot = this.data()?.slots[this.slotIndex];
    await this.mutate(action, { form: this.replacementForm || c.form, slotLevel: slot?.level, poolKey: slot?.poolKey });
  }
  private async run(work: () => Promise<CompanionResponse>) {
    if (this.readonly() || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { const data = await work(); this.accept(data); this.notice.set(data.notice ?? 'Saved.'); this.changed.emit(); }
    catch (err) { this.error.set(getErrorMessage(err)); const data = await this.service.get(this.characterId()).catch(() => null); if (data) this.data.set(data); }
    finally { this.busy.set(false); }
  }
  canAct(c: Companion) { return c.stats.eligible && c.status === 'active' && c.stats.current_hp > 0 && !this.readonly() && !this.busy(); }
  canCommand(c: Companion) {
    return this.canAct(c) && !this.data()?.ownerIncapacitated && !(c.turn?.started && (!c.turn.ownerTurn || c.turn.command || c.turn.actionUsed));
  }
  canUse(c: Companion, action: CompanionAction) {
    if (!this.canAct(c) || (action.uses !== undefined && (action.used ?? 0) >= action.uses)) return false;
    if (!c.turn?.started) return true;
    if (action.activation === 'reaction') return !c.turn.reactionUsed;
    return c.turn.ownerTurn && !c.turn.actionUsed && (this.data()?.ownerIncapacitated || action.key === 'dodge' || c.turn.command === action.key);
  }
}
