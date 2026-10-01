import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { CharacterService } from '../../core/services/character.service';
import { legacySeedToAvatarRecipe, portraitDataUri, portraitSource } from '../../core/utils/avatar';
import { AvatarCreatorDialogComponent } from './avatar-creator-dialog';

const UPLOADED = '/uploads/portraits/user-1/2f1c0f3e-0000-4000-8000-000000000000.webp';

describe('AvatarCreatorDialogComponent', () => {
  let close: ReturnType<typeof vi.fn>;

  function create(seed = 'legacy-avatar', image: string | null = null) {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [AvatarCreatorDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { seed, recipe: null, image } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: CharacterService, useValue: { uploadPortrait: vi.fn() } },
      ],
    });
    return TestBed.createComponent(AvatarCreatorDialogComponent).componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('starts from the explicit choices represented by a legacy seed', () => {
    const component = create();
    expect(component.recipe()).toEqual(legacySeedToAvatarRecipe('legacy-avatar'));
  });

  it('keeps required categories selected and allows optional categories to clear', () => {
    const component = create();
    const face = component.style().categories.find((category) => category.id === 'face')!;
    component.togglePart(face, face.parts[1]);
    expect(component.recipe().parts['face']).toEqual([face.parts[1].id]);
    component.togglePart(face, face.parts[1]);
    expect(component.recipe().parts['face']).toEqual([face.parts[1].id]);

    const details = component.style().categories.find((category) => category.id === 'faceDetails')!;
    component.togglePart(details, details.parts[0]);
    expect(component.recipe().parts['faceDetails']).toEqual(['freckles']);
    component.clearCategory(details);
    expect(component.recipe().parts['faceDetails']).toEqual([]);
  });

  it('enforces occupied accessory slots and validates custom hex colors', () => {
    const component = create();
    const accessories = component
      .style()
      .categories.find((category) => category.id === 'accessories')!;
    component.togglePart(accessories, accessories.parts[0]);
    const selectedPreview = component.partPreview(accessories, accessories.parts[0]);
    const alternatePreview = component.partPreview(accessories, accessories.parts[1]);
    expect(alternatePreview).not.toBe(selectedPreview);

    component.togglePart(accessories, accessories.parts[1]);
    expect(component.recipe().parts['accessories']).toEqual([accessories.parts[1].id]);

    const before = component.colorValue('skin');
    component.setColor('skin', 'red');
    expect(component.colorValue('skin')).toBe(before);
    component.setColor('skin', '#ABCDEF');
    expect(component.colorValue('skin')).toBe('#abcdef');
  });

  it('places colors with their categories and exposes future asset sections', () => {
    const component = create();
    const categories = component.style().categories;
    const face = categories.find((category) => category.id === 'face')!;
    const hair = categories.find((category) => category.id === 'hair')!;

    expect(component.colorsFor(face).map((color) => color.id)).toEqual(['skin']);
    expect(component.colorsFor(hair).map((color) => color.id)).toEqual(['hair']);
    for (const id of ['ears', 'horns', 'scars', 'tattoos']) {
      const category = categories.find((candidate) => candidate.id === id);
      expect(category?.parts).toEqual([]);
      expect(category?.minSelections).toBe(0);
    }
  });

  it('opens on the upload tab for an uploaded portrait and keeps it when applied unchanged', async () => {
    const component = create('legacy-avatar', UPLOADED);
    expect(component.mode()).toBe('upload');
    expect(component.previewUri()).toBe(UPLOADED);

    await component.apply();
    expect(close).toHaveBeenCalledWith({ recipe: component.recipe(), image: UPLOADED });
  });

  it('clears the uploaded portrait when the built avatar is applied', async () => {
    const component = create('legacy-avatar', UPLOADED);
    component.mode.set('build');
    expect(component.previewUri()).toBe(
      portraitDataUri(portraitSource('legacy-avatar', component.recipe())),
    );

    await component.apply();
    expect(close).toHaveBeenCalledWith({ recipe: component.recipe(), image: null });
  });

  it('cannot apply the upload tab before an image is chosen', async () => {
    const component = create();
    component.mode.set('upload');
    expect(component.canApply()).toBe(false);
    await component.apply();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('portraitSource', () => {
  it('prefers a valid uploaded image and ignores anything outside the portraits folder', () => {
    expect(portraitSource('seed', null, UPLOADED)).toEqual({
      kind: 'image',
      url: UPLOADED,
      fallbackSeed: 'seed',
    });
    expect(portraitSource('seed', null, 'https://example.com/x.png').kind).toBe('legacy');
    expect(portraitSource('seed', null, '/uploads/maps/a/b.png').kind).toBe('legacy');
  });
});
