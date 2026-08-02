import { DndBackground, DndFeat } from '../services/content.service';

export function resolveBackgroundOriginFeat(
  background: Pick<DndBackground, 'feature'> | null,
  feats: DndFeat[],
): DndFeat | null {
  if (!background) return null;
  const featureName = (background.feature ?? '')
    .replace(/^Origin Feat:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLocaleLowerCase();
  return feats.find(feat => feat.category === 'origin' && feat.name.toLocaleLowerCase() === featureName) ?? null;
}
