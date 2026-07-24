import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SlicePipe, UpperCasePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../../core/services/character.service';
import { ContentService } from '../../../core/services/content.service';
import { CharacterStatsService } from '../../../core/services/character-stats.service';
import { Character, ALIGNMENTS, SKILLS, defaultCharacter, abilityModifier } from '../../../core/models/character.model';
import { CharacterDisplayComponent } from '../../../shared/character-display/character-display';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
function markCharacterViewed(id: string) {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  views[id] = Date.now();
  localStorage.setItem(CHAR_VIEWED_KEY, JSON.stringify(views));
}

@Component({
  selector: 'app-character-sheet',
  imports: [ReactiveFormsModule, RouterLink, SlicePipe, UpperCasePipe, MatIconModule, MatTooltipModule],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheetComponent implements OnInit {
  private fb             = inject(FormBuilder);
  private characterService = inject(CharacterService);
  private content        = inject(ContentService);
  private statsService   = inject(CharacterStatsService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private dialog         = inject(MatDialog);

  readonly skillList  = Object.keys(SKILLS);
  readonly alignments = ALIGNMENTS;
  readonly abilityStats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

  races: string[]       = [];
  classes: string[]     = [];
  backgrounds: string[] = [];

  loading   = signal(false);
  saving    = signal(false);
  error     = signal<string | null>(null);
  characterId = signal<string | null>(null);

  // Loaded for stat hints
  classData  = signal<any>(null);
  raceData   = signal<any>(null);

  form = this.fb.nonNullable.group({
    name:       ['', Validators.required],
    race:       ['', Validators.required],
    class:      ['', Validators.required],
    subclass:   [''],
    level:      [1, [Validators.required, Validators.min(1), Validators.max(20)]],
    background: ['', Validators.required],
    alignment:  ['True Neutral', Validators.required],
    ability_scores: this.fb.nonNullable.group({
      strength:     [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      dexterity:    [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      constitution: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      intelligence: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      wisdom:       [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      charisma:     [10, [Validators.required, Validators.min(1), Validators.max(30)]],
    }),
    max_hp:      [10, [Validators.required, Validators.min(1)]],
    current_hp:  [10, [Validators.required, Validators.min(0)]],
    temp_hp:     [0],
    armor_class: [10, [Validators.required, Validators.min(1)]],
    speed:       [30, [Validators.required, Validators.min(0)]],
    personality_traits: [''],
    ideals:      [''],
    bonds:       [''],
    flaws:       [''],
    notes:       [''],
  });

  skillProficiencies: Record<string, boolean> = Object.fromEntries(this.skillList.map(s => [s, false]));
  expertise: Record<string, boolean>          = Object.fromEntries(this.skillList.map(s => [s, false]));

  getAbilityScore(stat: string): number {
    const scores = this.form.value.ability_scores as Record<string, number> | undefined;
    return scores?.[stat] ?? 10;
  }

  formatMod(score: number): string {
    const m = abilityModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  suggestedMaxHp(): number | null {
    const cls = this.classData();
    if (!cls) return null;
    const level   = this.form.value.level ?? 1;
    const conMod  = abilityModifier(this.form.value.ability_scores?.constitution ?? 10);
    const hit_die = cls.hit_die;
    return Math.max(1, hit_die + conMod + (level - 1) * (Math.floor(hit_die / 2) + 1 + conMod));
  }

  viewSheet() {
    const v = this.form.getRawValue();
    const char: Character = {
      ...defaultCharacter(),
      ...v,
      id: this.characterId() ?? undefined,
      skills: { ...this.skillProficiencies },
      expertise: { ...this.expertise },
      equipment: [], spells: [], spell_slots_used: {},
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      death_saves: { successes: 0, failures: 0 },
      conditions: [],
    } as Character;
    this.dialog.open(CharacterDisplayComponent, {
      data: { character: char },
      maxWidth: '860px', width: '95vw', maxHeight: '92vh', panelClass: 'char-sheet-dialog',
    });
  }

  async ngOnInit() {
    const [raceData, classData, bgData] = await Promise.all([
      this.content.getRaces(),
      this.content.getClasses(),
      this.content.getBackgrounds(),
    ]);
    this.races       = raceData.map(r => r.name);
    this.classes     = classData.map(c => c.name);
    this.backgrounds = bgData.map(b => b.name);

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.characterId.set(id);
      await this.loadCharacter(id);
    }
  }

  private async loadCharacter(id: string) {
    this.loading.set(true);
    try {
      const char = await this.characterService.getCharacter(id);
      this.form.patchValue(char as any);
      this.skillProficiencies = { ...char.skills };
      this.expertise          = { ...(char.expertise ?? {}) };
      markCharacterViewed(id);
      await this.loadContentForChar(char);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadContentForChar(char: Character) {
    const toIdx = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
    const [cls, race] = await Promise.allSettled([
      this.content.getClass(toIdx(char.class)),
      this.content.getRace(toIdx(char.race)),
    ]);
    if (cls.status  === 'fulfilled') this.classData.set(cls.value);
    if (race.status === 'fulfilled') this.raceData.set(race.value);
  }

  toggleSkill(skill: string)     { this.skillProficiencies[skill] = !this.skillProficiencies[skill]; }
  toggleExpertise(skill: string) { this.expertise[skill] = !this.expertise[skill]; }

  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const character: Character = {
        ...defaultCharacter(),
        ...v,
        id: this.characterId() ?? undefined,
        skills:    this.skillProficiencies,
        expertise: this.expertise,
        equipment: [], spells: [], spell_slots_used: {},
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        death_saves: { successes: 0, failures: 0 },
        conditions: [],
      } as Character;
      const saved = await this.characterService.saveCharacter(character);
      if (!this.characterId()) this.router.navigate(['/characters', saved.id], { replaceUrl: true });
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
