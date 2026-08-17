import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  AvatarCategoryDefinition,
  AvatarColorDefinition,
  AvatarPartDefinition,
  AvatarRecipeV1,
} from '../../core/models/avatar.model';
import {
  AVATAR_STYLE_DEFINITIONS,
  legacySeedToAvatarRecipe,
  normalizeAvatarRecipe,
  portraitDataUri,
  portraitSource,
  randomAvatarRecipe,
  randomAvatarRecipeForStyle,
  randomizeAvatarCategory,
} from '../../core/utils/avatar';

export interface AvatarCreatorDialogData {
  seed: string;
  recipe?: AvatarRecipeV1 | null;
}

@Component({
  selector: 'app-avatar-creator-dialog',
  imports: [FormsModule, MatDialogModule, MatIconModule, MatMenuModule],
  templateUrl: './avatar-creator-dialog.html',
  styleUrl: './avatar-creator-dialog.scss',
})
export class AvatarCreatorDialogComponent {
  readonly data = inject<AvatarCreatorDialogData>(MAT_DIALOG_DATA);
  readonly styles = AVATAR_STYLE_DEFINITIONS;
  readonly recipe = signal(
    normalizeAvatarRecipe(this.data.recipe) ?? legacySeedToAvatarRecipe(this.data.seed),
  );
  readonly style = computed(
    () =>
      this.styles.find(
        (candidate) =>
          candidate.id === this.recipe().styleId &&
          candidate.version === this.recipe().styleVersion,
      ) ?? this.styles[0],
  );
  readonly activePanel = signal(this.style().categories[0]?.id ?? '');

  readonly activeCategory = computed(
    () => this.style().categories.find((category) => category.id === this.activePanel()) ?? null,
  );
  readonly previewUri = computed(() =>
    portraitDataUri(portraitSource(this.data.seed, this.recipe())),
  );

  private readonly categoryColorIds: Readonly<Record<string, readonly string[]>> = {
    face: ['skin'],
    ears: ['skin'],
    eyes: ['eyes'],
    eyebrows: ['eyebrows'],
    mouth: ['mouth'],
    hair: ['hair'],
    facialHair: ['hair'],
    faceDetails: ['details'],
    scars: ['details'],
    tattoos: ['details'],
    horns: ['details'],
    piercings: ['piercings'],
    accessories: ['accessories'],
  };

  isSelected(categoryId: string, partId: string): boolean {
    return this.recipe().parts[categoryId]?.includes(partId) ?? false;
  }

  selectedLabel(category: AvatarCategoryDefinition): string {
    const selected = this.recipe().parts[category.id] ?? [];
    if (!selected.length) return 'None';
    return selected
      .map((id) => category.parts.find((part) => part.id === id)?.label ?? id)
      .join(', ');
  }

  colorsFor(category: AvatarCategoryDefinition): readonly AvatarColorDefinition[] {
    const colorIds = this.categoryColorIds[category.id] ?? [];
    return this.style().colors.filter((color) => colorIds.includes(color.id));
  }

  togglePart(category: AvatarCategoryDefinition, part: AvatarPartDefinition) {
    const current = [...(this.recipe().parts[category.id] ?? [])];
    const selectedIndex = current.indexOf(part.id);
    if (selectedIndex >= 0) {
      if (current.length <= category.minSelections) return;
      current.splice(selectedIndex, 1);
      this.setParts(category.id, current);
      return;
    }

    this.setParts(category.id, this.candidateParts(category, part));
  }

  clearCategory(category: AvatarCategoryDefinition) {
    if (category.minSelections === 0) this.setParts(category.id, []);
  }

  randomizeAll() {
    this.recipe.set(
      randomAvatarRecipeForStyle(this.style().id, this.style().version) ?? randomAvatarRecipe(),
    );
  }

  changeStyle(styleId: string) {
    const style = this.styles.find((candidate) => candidate.id === styleId);
    if (!style) return;
    const recipe = randomAvatarRecipeForStyle(style.id, style.version);
    if (!recipe) return;
    this.recipe.set(recipe);
    this.activePanel.set(style.categories[0]?.id ?? '');
  }

  randomizeCategory(category: AvatarCategoryDefinition) {
    this.recipe.set(randomizeAvatarCategory(this.recipe(), category.id));
  }

  setColor(colorId: string, value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    const normalized = normalizeAvatarRecipe({
      ...this.recipe(),
      colors: { ...this.recipe().colors, [colorId]: value.toLowerCase() },
    });
    if (normalized) this.recipe.set(normalized);
  }

  setColorInput(colorId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    if (!/^#[0-9a-f]{6}$/i.test(input.value)) {
      input.value = this.colorValue(colorId);
      return;
    }
    this.setColor(colorId, input.value);
  }

  colorValue(colorId: string): string {
    return this.recipe().colors[colorId] ?? '#000000';
  }

  partPreview(category: AvatarCategoryDefinition, part: AvatarPartDefinition): string {
    const current = this.recipe();
    const candidate =
      normalizeAvatarRecipe({
        ...current,
        parts: {
          ...current.parts,
          [category.id]: this.candidateParts(category, part),
        },
      }) ?? current;
    return portraitDataUri(portraitSource(this.data.seed, candidate));
  }

  private candidateParts(category: AvatarCategoryDefinition, part: AvatarPartDefinition): string[] {
    if (category.maxSelections === 1) return [part.id];

    const current = (this.recipe().parts[category.id] ?? []).filter((id) => id !== part.id);
    const conflicts = new Set(part.conflictsWith ?? []);
    const occupied = new Set(part.occupies ?? []);
    const compatible = current.filter((id) => {
      const existing = category.parts.find((candidate) => candidate.id === id);
      return (
        !conflicts.has(id) &&
        !existing?.conflictsWith?.includes(part.id) &&
        !existing?.occupies?.some((slot) => occupied.has(slot))
      );
    });
    return [...compatible, part.id].slice(-category.maxSelections);
  }

  private setParts(categoryId: string, parts: string[]) {
    const normalized = normalizeAvatarRecipe({
      ...this.recipe(),
      parts: { ...this.recipe().parts, [categoryId]: parts },
    });
    if (normalized) this.recipe.set(normalized);
  }
}
