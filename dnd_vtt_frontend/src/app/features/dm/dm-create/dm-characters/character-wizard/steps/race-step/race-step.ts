import { Component, OnInit, input, output, signal } from '@angular/core';
import { SKILLS } from '../../../../../../../core/models/character.model';
import { DndFeat, DndRace, TraitGrant } from '../../../../../../../core/services/content.service';

export type Subrace = DndRace['subraces'][number];

export interface RaceChoice {
  race: DndRace;
  subrace: Subrace | null;
  traits: Record<string, string[]>;
}

type ViewMode = 'list' | 'detail' | 'selected';

const STANDARD_LANGUAGES = [
  'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant',
  'Gnomish', 'Goblin', 'Halfling', 'Orc',
];

const LANGUAGE_GRANT: Extract<TraitGrant, { type: 'choice' }> = {
  type: 'choice',
  key: 'languages',
  name: 'Languages',
  choose: 2,
  description: 'Every character knows Common. Choose two additional languages from the Standard Languages list.',
  options: STANDARD_LANGUAGES.map(name => ({ name })),
};

const SIZE_KEY = 'size';

@Component({
  selector: 'app-race-step',
  templateUrl: './race-step.html',
})
export class RaceStepComponent implements OnInit {
  readonly races    = input.required<DndRace[]>();
  readonly feats    = input<DndFeat[]>([]);
  readonly selected = input<RaceChoice | null>(null);
  readonly raceChosen = output<RaceChoice>();
  readonly languageGrant = LANGUAGE_GRANT;

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
    this.collapsedGrants.set(new Set([
      LANGUAGE_GRANT.key,
      ...((race.size_options?.length ?? 0) > 1 ? [SIZE_KEY] : []),
      ...this.grantKeys(race),
    ]));
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
      .filter((g): g is Extract<TraitGrant, { key: string }> =>
        g.type === 'choice' || g.type === 'skill_choice' || g.type === 'feat_pick')
      .map(g => g.key);
    return [...choiceKeys(race.grants), ...race.subraces.flatMap(s => choiceKeys(s.grants))];
  }

  traitSelected(grant: TraitGrant & { key: string }, option: string): boolean {
    return this.draftTraits()[grant.key]?.includes(option) ?? false;
  }

  choicesLeft(grant: TraitGrant): number {
    if (grant.type !== 'choice' && grant.type !== 'skill_choice' && grant.type !== 'feat_pick') return 0;
    return Math.max(0, grant.choose - (this.draftTraits()[grant.key]?.length ?? 0));
  }

  availableSkills(grant: Extract<TraitGrant, { type: 'skill_choice' }>): string[] {
    return grant.skills?.length ? grant.skills : Object.keys(SKILLS);
  }

  availableFeats(grant: Extract<TraitGrant, { type: 'feat_pick' }>): DndFeat[] {
    return this.feats()
      .filter(feat => feat.category === grant.category && (!grant.feats?.length || grant.feats.includes(feat.index)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  selectedSize(race: DndRace): string {
    return this.draftTraits()[SIZE_KEY]?.[0] ?? (race.size_options?.length === 1 ? race.size_options[0] : '');
  }

  sizeGrant(race: DndRace): Extract<TraitGrant, { type: 'choice' }> | null {
    if ((race.size_options?.length ?? 0) <= 1) return null;
    return {
      type: 'choice',
      key: SIZE_KEY,
      name: 'Size',
      choose: 1,
      description: 'Choose your character\'s size.',
      options: race.size_options!.map(name => ({ name })),
    };
  }

  selectedLanguages(): string[] {
    return ['Common', ...(this.draftTraits()[LANGUAGE_GRANT.key] ?? [])];
  }

  raceComplete(race: DndRace): boolean {
    const size = this.sizeGrant(race);
    if (size && this.choicesLeft(size) > 0) return false;
    if (this.choicesLeft(LANGUAGE_GRANT) > 0) return false;
    const required = [
      ...(race.grants ?? []),
      ...(this.draftSubrace()?.grants ?? []),
    ].filter((grant): grant is Extract<TraitGrant, { key: string; choose: number }> =>
      grant.type === 'choice' || grant.type === 'skill_choice' || grant.type === 'feat_pick');
    return required.every(grant => this.choicesLeft(grant) === 0);
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
