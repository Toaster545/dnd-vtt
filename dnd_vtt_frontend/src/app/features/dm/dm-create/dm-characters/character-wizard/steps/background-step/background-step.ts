import { Component, OnInit, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DndBackground, DndFeat, TraitGrant } from '../../../../../../../core/services/content.service';
import { Ability, SKILLS } from '../../../../../../../core/models/character.model';
import { resolveBackgroundOriginFeat } from '../../../../../../../core/utils/background-origin-feat';
import {
  BACKGROUND_SKILLS_KEY,
  resolveBackgroundSkills,
} from '../../../../../../../core/utils/background-skills';

export interface BackgroundChoice {
  background: DndBackground;
  traits: Record<string, string[]>;
}

type AbilityGrant = Extract<TraitGrant, { type: 'ability_choice' }>;
type ChoiceGrant = Extract<TraitGrant, { type: 'choice' }>;
type SkillGrant = Extract<TraitGrant, { type: 'skill_choice' }>;
type ViewMode = 'list' | 'detail' | 'selected';

@Component({
  selector: 'app-background-step',
  imports: [FormsModule, MatIconModule],
  templateUrl: './background-step.html',
})
export class BackgroundStepComponent implements OnInit {
  readonly backgrounds        = input.required<DndBackground[]>();
  readonly feats              = input<DndFeat[]>([]);
  readonly selected           = input<BackgroundChoice | null>(null);
  readonly baseAbilityScores  = input.required<Record<Ability, number>>();
  readonly unavailableSkills  = input<string[]>([]);
  readonly backgroundChosen   = output<BackgroundChoice>();

  viewMode           = signal<ViewMode>('list');
  browsingBackground = signal<DndBackground | null>(null);
  draftTraits        = signal<Record<string, string[]>>({});
  editingSkills      = signal(false);
  originFeatCollapsed = signal(false);
  private skillEditSnapshot: string[] | null | undefined;

  readonly allSkills = Object.keys(SKILLS);

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
    this.editingSkills.set(false);
    this.originFeatCollapsed.set(false);
    this.skillEditSnapshot = undefined;
    this.browsingBackground.set(bg);
    this.viewMode.set('detail');
  }

  back() {
    this.editingSkills.set(false);
    this.browsingBackground.set(null);
    this.viewMode.set(this.selected() ? 'selected' : 'list');
  }

  goToList() {
    this.viewMode.set('list');
  }

  confirmBackground() {
    this.syncDraft();
    this.browsingBackground.set(null);
    this.viewMode.set('selected');
  }

  private syncDraft() {
    const background = this.browsingBackground();
    if (!background) return;
    this.backgroundChosen.emit({
      background,
      traits: Object.fromEntries(Object.entries(this.draftTraits()).map(([key, values]) => [key, [...values]])),
    });
  }

  isCurrentSelected(): boolean {
    const bg = this.browsingBackground();
    return !!bg && this.selected()?.background.index === bg.index;
  }

  isBackgroundSelected(bg: DndBackground): boolean {
    return this.selected()?.background.index === bg.index;
  }

  backgroundSkills(bg: DndBackground): string[] {
    return resolveBackgroundSkills(bg, this.draftTraits());
  }

  startEditingSkills(bg: DndBackground) {
    const saved = this.draftTraits()[BACKGROUND_SKILLS_KEY];
    const current = this.backgroundSkills(bg);
    this.skillEditSnapshot = saved ? [...saved] : null;
    this.draftTraits.update(traits => ({
      ...traits,
      [BACKGROUND_SKILLS_KEY]: [...current],
    }));
    this.editingSkills.set(true);
    this.syncDraft();
  }

  updateSkill(index: number, skill: string) {
    const background = this.browsingBackground();
    if (background && this.backgroundSkills(background)[index] !== skill && this.unavailableSkills().includes(skill)) return;
    this.draftTraits.update(traits => {
      const current = [...(traits[BACKGROUND_SKILLS_KEY] ?? [])];
      if (current.some((selected, i) => i !== index && selected === skill)) return traits;
      current[index] = skill;
      return { ...traits, [BACKGROUND_SKILLS_KEY]: current };
    });
    this.syncDraft();
  }

  skillUsedInOtherSlot(skill: string, index: number, bg: DndBackground): boolean {
    return this.backgroundSkills(bg).some((selected, i) => i !== index && selected === skill);
  }

  backgroundSkillUnavailable(skill: string, index: number, bg: DndBackground): boolean {
    return this.backgroundSkills(bg)[index] !== skill
      && (this.unavailableSkills().includes(skill) || this.originFeatSelectedSkills(bg).includes(skill));
  }

  backgroundSkillConflict(skill: string, index: number, bg: DndBackground): boolean {
    return this.backgroundSkills(bg)[index] === skill
      && (this.unavailableSkills().includes(skill) || this.originFeatSelectedSkills(bg).includes(skill));
  }

  hasBackgroundSkillConflict(bg: DndBackground): boolean {
    return this.conflictingBackgroundSkills(bg).length > 0;
  }

  conflictingBackgroundSkills(bg: DndBackground): string[] {
    return this.backgroundSkills(bg)
      .filter((skill, index) => this.backgroundSkillConflict(skill, index, bg));
  }

  finishEditingSkills() {
    this.editingSkills.set(false);
    this.skillEditSnapshot = undefined;
  }

  cancelEditingSkills() {
    const snapshot = this.skillEditSnapshot;
    this.draftTraits.update(traits => {
      const next = { ...traits };
      if (snapshot) next[BACKGROUND_SKILLS_KEY] = [...snapshot];
      else delete next[BACKGROUND_SKILLS_KEY];
      return next;
    });
    this.editingSkills.set(false);
    this.skillEditSnapshot = undefined;
    this.syncDraft();
  }

  restoreDefaultSkills() {
    this.draftTraits.update(traits => {
      const next = { ...traits };
      delete next[BACKGROUND_SKILLS_KEY];
      return next;
    });
    this.editingSkills.set(false);
    this.skillEditSnapshot = undefined;
    this.syncDraft();
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

  originFeat(bg: DndBackground): DndFeat | null {
    return resolveBackgroundOriginFeat(bg, this.feats());
  }

  originFeatChoiceGrants(bg: DndBackground): ChoiceGrant[] {
    return (this.originFeat(bg)?.grants ?? []).filter((grant): grant is ChoiceGrant => grant.type === 'choice');
  }

  originFeatSkillGrants(bg: DndBackground): SkillGrant[] {
    return (this.originFeat(bg)?.grants ?? []).filter((grant): grant is SkillGrant => grant.type === 'skill_choice');
  }

  private originFeatSelectedSkills(bg: DndBackground): string[] {
    return this.originFeatSkillGrants(bg)
      .flatMap(grant => this.draftTraits()[grant.key] ?? []);
  }

  originFeatChoicesLeft(bg: DndBackground): number {
    return [...this.originFeatChoiceGrants(bg), ...this.originFeatSkillGrants(bg)]
      .reduce((total, grant) => total + Math.max(0, grant.choose - (this.draftTraits()[grant.key]?.length ?? 0)), 0);
  }

  originFeatHasSkillConflict(bg: DndBackground): boolean {
    return this.originFeatSkillGrants(bg)
      .some(grant => this.conflictingFeatSkills(bg, grant).length > 0);
  }

  featSkillSelected(grant: SkillGrant, skill: string): boolean {
    return this.draftTraits()[grant.key]?.includes(skill) ?? false;
  }

  featSkillUnavailable(bg: DndBackground, grant: SkillGrant, skill: string): boolean {
    return !this.featSkillSelected(grant, skill) && this.featSkillTakenElsewhere(bg, grant, skill);
  }

  featSkillConflict(bg: DndBackground, grant: SkillGrant, skill: string): boolean {
    return this.featSkillSelected(grant, skill) && this.featSkillTakenElsewhere(bg, grant, skill);
  }

  conflictingFeatSkills(bg: DndBackground, grant: SkillGrant): string[] {
    return (this.draftTraits()[grant.key] ?? [])
      .filter(skill => this.featSkillConflict(bg, grant, skill));
  }

  private featSkillTakenElsewhere(bg: DndBackground, grant: SkillGrant, skill: string): boolean {
    const selectedByAnotherFeatGrant = this.originFeatSkillGrants(bg)
      .filter(candidate => candidate.key !== grant.key)
      .some(candidate => this.draftTraits()[candidate.key]?.includes(skill));
    return this.unavailableSkills().includes(skill)
      || this.backgroundSkills(bg).includes(skill)
      || selectedByAnotherFeatGrant;
  }

  toggleFeatSkill(bg: DndBackground, grant: SkillGrant, skill: string) {
    const selected = this.draftTraits()[grant.key] ?? [];
    if (!selected.includes(skill) && (selected.length >= grant.choose || this.featSkillUnavailable(bg, grant, skill))) return;
    const next = selected.includes(skill)
      ? selected.filter(candidate => candidate !== skill)
      : [...selected, skill];
    this.draftTraits.update(traits => ({ ...traits, [grant.key]: next }));
    this.syncDraft();
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
    this.syncDraft();
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
    this.syncDraft();
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
    this.syncDraft();
  }
}
