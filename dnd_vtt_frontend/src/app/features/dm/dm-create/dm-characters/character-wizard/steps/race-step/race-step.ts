import { Component, OnInit, input, output, signal } from '@angular/core';
import { DndRace, TraitGrant } from '../../../../../../../core/services/content.service';

export type Subrace = DndRace['subraces'][number];

export interface RaceChoice {
  race: DndRace;
  subrace: Subrace | null;
  traits: Record<string, string[]>;
}

type ViewMode = 'list' | 'detail' | 'selected';

@Component({
  selector: 'app-race-step',
  templateUrl: './race-step.html',
})
export class RaceStepComponent implements OnInit {
  readonly races    = input.required<DndRace[]>();
  readonly selected = input<RaceChoice | null>(null);
  readonly raceChosen = output<RaceChoice>();

  viewMode      = signal<ViewMode>('list');
  browsingRace  = signal<DndRace | null>(null);

  draftSubrace    = signal<Subrace | null>(null);
  draftTraits     = signal<Record<string, string[]>>({});
  collapsedGrants = signal<Set<string>>(new Set());

  ngOnInit() {
    if (this.selected()) this.viewMode.set('selected');
  }

  openFromList(race: DndRace) {
    this.openDetail(race);
  }

  editSelected() {
    const sel = this.selected();
    if (sel) this.openDetail(sel.race);
  }

  goToList() {
    this.viewMode.set('list');
  }

  private openDetail(race: DndRace) {
    const existing = this.selected()?.race.index === race.index ? this.selected() : null;
    this.draftSubrace.set(existing?.subrace ?? (race.subraces.length === 1 ? race.subraces[0] : null));
    this.draftTraits.set(existing?.traits ? { ...existing.traits } : {});
    this.collapsedGrants.set(new Set(this.grantKeys(race)));
    this.browsingRace.set(race);
    this.viewMode.set('detail');
  }

  back() {
    this.browsingRace.set(null);
    this.viewMode.set(this.selected() ? 'selected' : 'list');
  }

  confirmRace() {
    const race = this.browsingRace();
    if (!race) return;
    this.raceChosen.emit({
      race,
      subrace: this.draftSubrace(),
      traits: Object.fromEntries(Object.entries(this.draftTraits()).map(([k, v]) => [k, [...v]])),
    });
    this.browsingRace.set(null);
    this.viewMode.set('selected');
  }

  isCurrentSelected(): boolean {
    const race = this.browsingRace();
    return !!race && this.selected()?.race.index === race.index;
  }

  isRaceSelected(race: DndRace): boolean {
    return this.selected()?.race.index === race.index;
  }

  selectSubrace(sub: Subrace) {
    this.draftSubrace.set(sub);
  }

  // A race's own traits, rendered the same way class features are: its structured `grants` if
  // present, otherwise each legacy trait string promoted to a plain feature grant.
  raceGrants(race: DndRace): TraitGrant[] {
    return race.grants?.length ? race.grants : race.traits.map(name => ({ type: 'feature', name }) as TraitGrant);
  }

  subraceGrants(sub: Subrace): TraitGrant[] {
    return sub.grants?.length ? sub.grants : sub.traits.map(name => ({ type: 'feature', name }) as TraitGrant);
  }

  private grantKeys(race: DndRace): string[] {
    const choiceKeys = (grants?: TraitGrant[]) => (grants ?? [])
      .filter((g): g is Extract<TraitGrant, { key: string }> => g.type === 'choice')
      .map(g => g.key);
    return [...choiceKeys(race.grants), ...race.subraces.flatMap(s => choiceKeys(s.grants))];
  }

  traitSelected(grant: TraitGrant & { key: string }, option: string): boolean {
    return this.draftTraits()[grant.key]?.includes(option) ?? false;
  }

  choicesLeft(grant: TraitGrant): number {
    return grant.type === 'choice' ? grant.choose - (this.draftTraits()[grant.key]?.length ?? 0) : 0;
  }

  isGrantCollapsed(key: string): boolean {
    return this.collapsedGrants().has(key);
  }

  toggleGrantCollapsed(key: string) {
    this.collapsedGrants.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  toggleTrait(grant: TraitGrant & { choose: number; key: string }, option: string) {
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
}
