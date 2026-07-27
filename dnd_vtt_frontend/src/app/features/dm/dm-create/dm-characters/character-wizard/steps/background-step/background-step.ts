import { Component, OnInit, input, output, signal } from '@angular/core';
import { DndBackground, TraitGrant } from '../../../../../../../core/services/content.service';
import { Ability } from '../../../../../../../core/models/character.model';

export interface BackgroundChoice {
  background: DndBackground;
  traits: Record<string, string[]>;
}

type AbilityGrant = Extract<TraitGrant, { type: 'ability_choice' }>;
type ChoiceGrant = Extract<TraitGrant, { type: 'choice' }>;
type ViewMode = 'list' | 'detail' | 'selected';

@Component({
  selector: 'app-background-step',
  templateUrl: './background-step.html',
})
export class BackgroundStepComponent implements OnInit {
  readonly backgrounds        = input.required<DndBackground[]>();
  readonly selected           = input<BackgroundChoice | null>(null);
  readonly baseAbilityScores  = input.required<Record<Ability, number>>();
  readonly backgroundChosen   = output<BackgroundChoice>();

  viewMode           = signal<ViewMode>('list');
  browsingBackground = signal<DndBackground | null>(null);
  draftTraits        = signal<Record<string, string[]>>({});

  ngOnInit() {
    if (this.selected()) this.viewMode.set('selected');
  }

  openFromList(bg: DndBackground) {
    this.openDetail(bg);
  }

  editSelected() {
    const sel = this.selected();
    if (sel) this.openDetail(sel.background);
  }

  private openDetail(bg: DndBackground) {
    const existing = this.selected()?.background.index === bg.index ? this.selected() : null;
    this.draftTraits.set(existing?.traits ? { ...existing.traits } : {});
    this.browsingBackground.set(bg);
    this.viewMode.set('detail');
  }

  back() {
    this.browsingBackground.set(null);
    this.viewMode.set(this.selected() ? 'selected' : 'list');
  }

  goToList() {
    this.viewMode.set('list');
  }

  confirmBackground() {
    const bg = this.browsingBackground();
    if (!bg) return;
    this.backgroundChosen.emit({
      background: bg,
      traits: Object.fromEntries(Object.entries(this.draftTraits()).map(([k, v]) => [k, [...v]])),
    });
    this.browsingBackground.set(null);
    this.viewMode.set('selected');
  }

  isCurrentSelected(): boolean {
    const bg = this.browsingBackground();
    return !!bg && this.selected()?.background.index === bg.index;
  }

  isBackgroundSelected(bg: DndBackground): boolean {
    return this.selected()?.background.index === bg.index;
  }

  // Starting equipment is picked in its own wizard step (it needs the item catalog and a
  // gear-or-gold choice, more than a one-line summary can show) — this is just a pointer there.
  // Older content not yet migrated to the structured shape still shows its flat item list.
  equipmentPreview(bg: DndBackground): string {
    const equip: unknown = bg.starting_equipment;
    return Array.isArray(equip) ? equip.join(', ') : 'Choose in the Equipment step';
  }

  abilityChoiceGrant(bg: DndBackground): AbilityGrant | null {
    const grant = bg.grants?.find(g => g.type === 'ability_choice');
    return grant?.type === 'ability_choice' ? grant : null;
  }

  // Skill/tool picks (e.g. Soldier's "choose 2 skills" / "choose one kind of gaming set") —
  // self-contained `choice` grants with their own embedded options, same shape a class's
  // `choice` grant uses, so no separate "from" list needs to live on DndBackground itself.
  choiceGrants(bg: DndBackground): ChoiceGrant[] {
    return (bg.grants ?? []).filter((g): g is ChoiceGrant => g.type === 'choice');
  }

  traitSelected(grant: ChoiceGrant, option: string): boolean {
    return this.draftTraits()[grant.key]?.includes(option) ?? false;
  }

  choiceLeft(grant: ChoiceGrant): number {
    return grant.choose - (this.draftTraits()[grant.key]?.length ?? 0);
  }

  toggleChoice(grant: ChoiceGrant, option: string) {
    this.draftTraits.update(traits => {
      const current = traits[grant.key] ?? [];
      if (grant.choose === 1) {
        return { ...traits, [grant.key]: current.includes(option) ? [] : [option] };
      }
      if (current.includes(option)) {
        return { ...traits, [grant.key]: current.filter(o => o !== option) };
      }
      if (current.length >= grant.choose) return traits;
      return { ...traits, [grant.key]: [...current, option] };
    });
  }

  baseScoreFor(ability: string): number {
    return this.baseAbilityScores()[ability as Ability] ?? 10;
  }

  abilityAllocated(grant: AbilityGrant, ability: string): number {
    return (this.draftTraits()[grant.key] ?? []).filter(a => a === ability).length;
  }

  choicesLeft(grant: AbilityGrant): number {
    return grant.points - (this.draftTraits()[grant.key]?.length ?? 0);
  }

  canIncrement(grant: AbilityGrant, ability: string): boolean {
    if (this.choicesLeft(grant) <= 0) return false;
    if (this.abilityAllocated(grant, ability) >= 2) return false;
    return this.baseScoreFor(ability) + this.abilityAllocated(grant, ability) < 20;
  }

  increment(grant: AbilityGrant, ability: string) {
    if (!this.canIncrement(grant, ability)) return;
    this.draftTraits.update(traits => ({ ...traits, [grant.key]: [...(traits[grant.key] ?? []), ability] }));
  }

  decrement(grant: AbilityGrant, ability: string) {
    this.draftTraits.update(traits => {
      const current = traits[grant.key] ?? [];
      const idx = current.lastIndexOf(ability);
      if (idx === -1) return traits;
      const next = [...current];
      next.splice(idx, 1);
      return { ...traits, [grant.key]: next };
    });
  }
}
