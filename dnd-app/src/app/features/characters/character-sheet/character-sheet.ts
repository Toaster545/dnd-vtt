import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AsyncPipe, SlicePipe, UpperCasePipe } from '@angular/common';
import { CharacterService } from '../../../core/services/character.service';
import { Open5eService } from '../../../core/services/open5e.service';
import { Character, abilityModifier } from '../../../core/models/character.model';

const SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

@Component({
  selector: 'app-character-sheet',
  imports: [ReactiveFormsModule, AsyncPipe, SlicePipe, UpperCasePipe, RouterLink],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheetComponent implements OnInit {
  private fb = inject(FormBuilder);
  private characterService = inject(CharacterService);
  private open5e = inject(Open5eService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly skills = SKILLS;
  readonly alignments = ALIGNMENTS;

  races$ = this.open5e.getRaces();
  classes$ = this.open5e.getClasses();
  backgrounds$ = this.open5e.getBackgrounds();

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

  mod = abilityModifier;
  getAbilityScore(stat: string): number {
    const scores = this.form.value.ability_scores as Record<string, number> | undefined;
    return scores?.[stat] ?? 10;
  }

  formatMod = (score: number) => {
    const m = abilityModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  };

  async ngOnInit() {
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
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  toggleSkill(skill: string) {
    this.skillProficiencies[skill] = !this.skillProficiencies[skill];
  }

  async save() {
    if (this.form.invalid) return;
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
      if (!this.characterId()) {
        this.router.navigate(['/characters', saved.id], { replaceUrl: true });
      }
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
