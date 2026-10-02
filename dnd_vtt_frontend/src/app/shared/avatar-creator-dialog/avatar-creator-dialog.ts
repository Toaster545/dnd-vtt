import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
  isPortraitImageUrl,
  legacySeedToAvatarRecipe,
  normalizeAvatarRecipe,
  portraitDataUri,
  portraitSource,
  randomAvatarRecipe,
  randomAvatarRecipeForStyle,
  randomizeAvatarCategory,
} from '../../core/utils/avatar';
import { CharacterService } from '../../core/services/character.service';
import { HttpErrorResponse } from '@angular/common/http';
import { PortraitCropperComponent } from './portrait-cropper';
import { TokenBorderPreviewComponent } from './token-border-preview';
import {
  TokenBorder,
  TokenBorderMaterial,
  TokenBorderPattern,
} from '../../core/models/token-border.model';
import {
  DEFAULT_TOKEN_BORDER,
  normalizeTokenBorder,
  TOKEN_BORDER_PALETTE,
  TOKEN_BORDER_PATTERNS,
  TOKEN_BORDER_MATERIALS,
  TOKEN_BORDER_MAX_WIDTH,
  TOKEN_BORDER_MIN_WIDTH,
  TOKEN_FACE_MAX_SCALE,
  TOKEN_FACE_MIN_SCALE,
} from '../../core/utils/token-border';

export interface AvatarCreatorDialogData {
  seed: string;
  recipe?: AvatarRecipeV1 | null;
  image?: string | null;
  tokenBorder?: TokenBorder | null;
}

// `recipe` is always the builder's current design (kept even while an upload is in use, so
// switching back restores it); `image` is the uploaded portrait URL, or null for the built avatar.
type BorderColorKey = 'color' | 'gradientColor' | 'backgroundColor';

// Starting color when the background is first switched on.
const DEFAULT_BACKGROUND_COLOR = '#1f2937';

// `tokenBorder` is null when the player keeps (or resets to) the default battle-map ring.
export interface AvatarCreatorResult {
  recipe: AvatarRecipeV1;
  image: string | null;
  tokenBorder: TokenBorder | null;
}

@Component({
  selector: 'app-avatar-creator-dialog',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    PortraitCropperComponent,
    TokenBorderPreviewComponent,
  ],
  templateUrl: './avatar-creator-dialog.html',
  styleUrl: './avatar-creator-dialog.scss',
})
export class AvatarCreatorDialogComponent {
  readonly data = inject<AvatarCreatorDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AvatarCreatorDialogComponent>);
  private readonly characters = inject(CharacterService);
  private readonly cropper = viewChild(PortraitCropperComponent);
  readonly existingImage = isPortraitImageUrl(this.data.image) ? this.data.image : null;
  readonly mode = signal<'build' | 'upload'>(this.existingImage ? 'upload' : 'build');
  // Live crop preview once a new file is loaded; until then the previously uploaded portrait.
  readonly uploadPreview = signal<string | null>(null);
  readonly saving = signal(false);
  readonly tab = signal<'portrait' | 'token'>('portrait');
  // null = the default ring (drawn in the token's per-map color); any edit on the Token tab
  // starts a custom style from DEFAULT_TOKEN_BORDER.
  readonly tokenBorder = signal<TokenBorder | null>(normalizeTokenBorder(this.data.tokenBorder));
  readonly borderShown = computed(() => this.tokenBorder() ?? DEFAULT_TOKEN_BORDER);
  readonly borderPalette = TOKEN_BORDER_PALETTE;
  readonly minBorderWidth = TOKEN_BORDER_MIN_WIDTH;
  readonly maxBorderWidth = TOKEN_BORDER_MAX_WIDTH;
  readonly minFaceScale = TOKEN_FACE_MIN_SCALE;
  readonly maxFaceScale = TOKEN_FACE_MAX_SCALE;
  readonly borderMaterials = TOKEN_BORDER_MATERIALS;
  readonly borderPatterns = TOKEN_BORDER_PATTERNS;
  readonly saveError = signal('');
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
  readonly previewUri = computed(() => {
    if (this.mode() === 'upload') return this.uploadPreview() ?? this.existingImage ?? '';
    return portraitDataUri(portraitSource(this.data.seed, this.recipe()));
  });
  readonly canApply = computed(
    () =>
      !this.saving() && (this.mode() === 'build' || !!this.uploadPreview() || !!this.existingImage),
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

  cropChanged() {
    this.uploadPreview.set(this.cropper()?.previewDataUrl() ?? null);
  }

  async apply() {
    if (!this.canApply()) return;
    if (this.mode() === 'build') {
      this.dialogRef.close(this.result(null));
      return;
    }
    if (!this.uploadPreview()) {
      this.dialogRef.close(this.result(this.existingImage));
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    try {
      const blob = await this.cropper()?.export();
      if (!blob) throw new Error('The cropped portrait could not be created.');
      const image = await this.characters.uploadPortrait(blob);
      this.dialogRef.close(this.result(image));
    } catch (error) {
      // Prefer the backend's reason (wrong type, too large) over HttpClient's generic message.
      const reason =
        error instanceof HttpErrorResponse
          ? error.status === 413
            ? 'That image is too large.'
            : error.error?.message
          : error instanceof Error
            ? error.message
            : null;
      this.saveError.set(typeof reason === 'string' ? reason : 'Could not upload the portrait.');
    } finally {
      this.saving.set(false);
    }
  }

  private result(image: string | null): AvatarCreatorResult {
    return { recipe: this.recipe(), image, tokenBorder: this.tokenBorder() };
  }

  updateBorder(patch: Partial<TokenBorder>) {
    const next = normalizeTokenBorder({ ...this.borderShown(), ...patch });
    if (next) this.tokenBorder.set(next);
  }

  borderColor(key: BorderColorKey): string {
    return this.borderShown()[key] ?? '';
  }

  // Only the custom style's own value counts as selected — the default ring has no swatch.
  isBorderSwatch(key: BorderColorKey, swatch: string): boolean {
    return this.tokenBorder()?.[key] === swatch;
  }

  setBorderColor(key: BorderColorKey, color: string) {
    this.updateBorder({ [key]: color });
  }

  setBorderColorInput(key: BorderColorKey, event: Event) {
    const input = event.target as HTMLInputElement;
    if (!/^#[0-9a-f]{6}$/i.test(input.value)) {
      input.value = this.borderColor(key);
      return;
    }
    this.setBorderColor(key, input.value);
  }

  // Turning the gradient on picks a second color distinct from the first, so the change is
  // visible right away instead of blending between two identical colors.
  setGradient(on: boolean) {
    if (!on) {
      this.updateBorder({ gradientColor: null });
      return;
    }
    const color = this.borderShown().color;
    const index = Math.max(0, this.borderPalette.indexOf(color));
    // A few swatches along the palette is a different hue, not a near-neighbor shade.
    const gradientColor = this.borderPalette[(index + 4) % this.borderPalette.length];
    this.updateBorder({ gradientColor });
  }

  setBackground(on: boolean) {
    this.updateBorder({ backgroundColor: on ? DEFAULT_BACKGROUND_COLOR : null });
  }

  setBorderMaterial(material: TokenBorderMaterial) {
    this.updateBorder({ material });
  }

  setFaceScale(faceScale: number) {
    this.updateBorder({ faceScale });
  }

  setBorderWidth(width: number) {
    this.updateBorder({ width });
  }

  setBorderPattern(pattern: TokenBorderPattern) {
    this.updateBorder({ pattern });
  }

  resetBorder() {
    this.tokenBorder.set(null);
  }

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
