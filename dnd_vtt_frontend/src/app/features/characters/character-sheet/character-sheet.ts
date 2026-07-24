import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SlicePipe, UpperCasePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../../core/services/character.service';
import { ContentService } from '../../../core/services/content.service';
import { Character, ALIGNMENTS, abilityModifier } from '../../../core/models/character.model';
import { CharacterDisplayComponent } from '../../../shared/character-display/character-display';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
function markCharacterViewed(id: string) {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  views[id] = Date.now();
  localStorage.setItem(CHAR_VIEWED_KEY, JSON.stringify(views));
}

const SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

@Component({
  selector: 'app-character-sheet',
  imports: [ReactiveFormsModule, RouterLink, SlicePipe, UpperCasePipe, MatIconModule, MatTooltipModule],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheetComponent implements OnInit {
  private fb = inject(FormBuilder);
  private characterService = inject(CharacterService);
  private content = inject(ContentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  readonly skills = SKILLS;
  readonly alignments = ALIGNMENTS;
  readonly abilityStats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  readonly combatFields = [
    { key: 'max_hp', label: 'Max HP' }, { key: 'current_hp', label: 'Current HP' },
    { key: 'armor_class', label: 'Armor Class' }, { key: 'speed', label: 'Speed (ft)' },
    { key: 'proficiency_bonus', label: 'Prof. Bonus' },
  ];

  races: string[] = [];
  classes: string[] = [];
  backgrounds: string[] = [];

  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  characterId = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    race: ['', Validators.required],
    class: ['', Validators.required],
    subclass: [''],
    level: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
    background: ['', Validators.required],
    alignment: ['True Neutral', Validators.required],
    ability_scores: this.fb.nonNullable.group({
      strength: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      dexterity: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      constitution: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      intelligence: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      wisdom: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
      charisma: [10, [Validators.required, Validators.min(1), Validators.max(30)]],
    }),
    max_hp: [10, [Validators.required, Validators.min(1)]],
    current_hp: [10, [Validators.required, Validators.min(0)]],
    armor_class: [10, [Validators.required, Validators.min(1)]],
    speed: [30, [Validators.required, Validators.min(0)]],
    proficiency_bonus: [2, [Validators.required, Validators.min(2)]],
    notes: [''],
  });

  skillProficiencies: Record<string, boolean> = Object.fromEntries(SKILLS.map(s => [s, false]));

  viewSheet() {
    const v = this.form.getRawValue();
    const char: Character = {
      ...v,
      id: this.characterId() ?? undefined,
      skills: { ...this.skillProficiencies },
      equipment: [],
      spells: [],
    };
    this.dialog.open(CharacterDisplayComponent, {
      data: { character: char },
      maxWidth: '860px',
      width: '95vw',
      maxHeight: '92vh',
      panelClass: 'char-sheet-dialog',
    });
  }

  getAbilityScore(stat: string): number {
    const scores = this.form.value.ability_scores as Record<string, number> | undefined;
    return scores?.[stat] ?? 10;
  }

  formatMod(score: number): string {
    const m = abilityModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  async ngOnInit() {
    const [raceData, classData, bgData] = await Promise.all([
      this.content.getRaces(),
      this.content.getClasses(),
      this.content.getBackgrounds(),
    ]);
    this.races = raceData.map(r => r.name);
    this.classes = classData.map(c => c.name);
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
      markCharacterViewed(id);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  toggleSkill(skill: string) { this.skillProficiencies[skill] = !this.skillProficiencies[skill]; }

  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      const character: Character = {
        ...(this.form.value as any),
        id: this.characterId() ?? undefined,
        skills: this.skillProficiencies,
        equipment: [],
        spells: [],
      };
      const saved = await this.characterService.saveCharacter(character);
      if (!this.characterId()) this.router.navigate(['/characters', saved.id], { replaceUrl: true });
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
