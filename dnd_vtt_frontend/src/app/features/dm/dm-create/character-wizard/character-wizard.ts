import { Component, inject, signal, computed, output, OnInit, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ContentService, DndRace, DndClass, DndBackground } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { Character, abilityModifier } from '../../../../core/models/character.model';

type Ability = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
const ABILITIES: Ability[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_SHORT: Record<Ability, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};
const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const STEPS = ['Race', 'Class', 'Background', 'Abilities', 'Details'];

@Component({
  selector: 'app-character-wizard',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './character-wizard.html',
  styleUrl: './character-wizard.scss',
})
export class CharacterWizardComponent implements OnInit {
  private content = inject(ContentService);
  private characterService = inject(CharacterService);
  private snackBar = inject(MatSnackBar);

  readonly character = input<Character | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  readonly steps = STEPS;
  readonly abilities = ABILITIES;
  readonly abilityShort = ABILITY_SHORT;
  readonly alignments = ALIGNMENTS;
  readonly standardArray = STANDARD_ARRAY;

  activeStep = signal(0);

  races = signal<DndRace[]>([]);
  classes = signal<DndClass[]>([]);
  backgrounds = signal<DndBackground[]>([]);
  loading = signal(true);

  characterId = signal<string | null>(null);
  selectedRace = signal<DndRace | null>(null);
  selectedClass = signal<DndClass | null>(null);
  selectedBackground = signal<DndBackground | null>(null);

  assignments = signal<Record<Ability, number | null>>({
    strength: null, dexterity: null, constitution: null,
    intelligence: null, wisdom: null, charisma: null,
  });

  characterName = '';
  level = signal(1);
  alignment = 'True Neutral';
  subclass = '';
  currentHp = signal<number | null>(null);
  saving = signal(false);

  subclassOptions = computed(() => this.selectedClass()?.subclasses?.map(s => s.name) ?? []);

  racialASI = computed(() => {
    const race = this.selectedRace();
    const bonus: Record<Ability, number> = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
    if (!race) return bonus;
    for (const ab of race.ability_bonuses) {
      const key = ab.ability as Ability;
      if (key in bonus) bonus[key] += ab.bonus;
    }
    return bonus;
  });

  finalScores = computed(() => {
    const assigned = this.assignments();
    const asi = this.racialASI();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: (assigned[ab] ?? 0) + asi[ab] }), {} as Record<Ability, number>);
  });

  profBonus = computed(() => Math.ceil(this.level() / 4) + 1);

  maxHP = computed(() => {
    const cls = this.selectedClass();
    if (!cls) return 10;
    const die = cls.hit_die;
    const conMod = abilityModifier(this.finalScores().constitution);
    return Math.max(1, die + conMod + (this.level() - 1) * (Math.floor(die / 2) + 1 + conMod));
  });

  armorClass = computed(() => 10 + abilityModifier(this.finalScores().dexterity));
  speed = computed(() => this.selectedRace()?.speed ?? 30);
  isEditing = computed(() => this.characterId() !== null);

  async ngOnInit() {
    const [races, classes, backgrounds] = await Promise.all([
      this.content.getRaces(),
      this.content.getClasses(),
      this.content.getBackgrounds(),
    ]);
    this.races.set(races);
    this.classes.set(classes);
    this.backgrounds.set(backgrounds);
    this.loading.set(false);

    const existing = this.character();
    if (existing) {
      this.characterId.set(existing.id ?? null);
      this.characterName = existing.name;
      this.level.set(existing.level);
      this.alignment = existing.alignment;
      this.subclass = existing.subclass ?? '';
      this.currentHp.set(existing.current_hp);
      const race = races.find(r => r.name === existing.race) ?? null;
      const cls  = classes.find(c => c.name === existing.class) ?? null;
      const bg   = backgrounds.find(b => b.name === existing.background) ?? null;
      this.selectedRace.set(race);
      this.selectedClass.set(cls);
      this.selectedBackground.set(bg);
      const scores = existing.ability_scores as Record<Ability, number>;
      if (scores && race) {
        const asiBonus: Record<Ability, number> = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
        for (const ab of race.ability_bonuses) {
          const key = ab.ability as Ability;
          if (key in asiBonus) asiBonus[key] += ab.bonus;
        }
        this.assignments.set(ABILITIES.reduce((acc, ab) => ({
          ...acc, [ab]: scores[ab] ? scores[ab] - asiBonus[ab] : null,
        }), {} as Record<Ability, number | null>));
      }
    }
  }

  assign(ab: Ability, value: number | null) {
    this.assignments.update(curr => ({ ...curr, [ab]: value }));
  }

  optionsFor(ab: Ability): number[] {
    const current = this.assignments()[ab];
    const usedElsewhere = ABILITIES.filter(a => a !== ab).map(a => this.assignments()[a]).filter((v): v is number => v !== null);
    return STANDARD_ARRAY.filter(v => v === current || !usedElsewhere.includes(v));
  }

  isValueAssigned(v: number): boolean { return Object.values(this.assignments()).includes(v); }
  asiFor(ab: Ability): number { return this.racialASI()[ab]; }

  mod(score: number): string {
    const m = abilityModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  raceASISummary(race: DndRace): string {
    return race.ability_bonuses
      .map(ab => `+${ab.bonus} ${ab.ability.charAt(0).toUpperCase() + ab.ability.slice(0, 3)}`)
      .join(' ');
  }

  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const hp = this.maxHP();
      const result = await this.characterService.saveCharacter({
        id: this.characterId() ?? undefined,
        name: this.characterName.trim() || 'Unnamed Character',
        race: this.selectedRace()?.name ?? '',
        class: this.selectedClass()?.name ?? '',
        subclass: this.subclass,
        level: this.level(),
        background: this.selectedBackground()?.name ?? '',
        alignment: this.alignment,
        ability_scores: { ...this.finalScores() },
        max_hp: hp,
        current_hp: this.currentHp() ?? hp,
        armor_class: this.armorClass(),
        speed: this.speed(),
        proficiency_bonus: this.profBonus(),
        skills: {}, equipment: [], spells: [], notes: '',
      });
      this.characterId.set(result.id ?? null);
      this.snackBar.open('Progress saved', 'OK', { duration: 2000 });
    } finally { this.saving.set(false); }
  }

  async saveAndClose() { await this.save(); this.saved.emit(); }
}
