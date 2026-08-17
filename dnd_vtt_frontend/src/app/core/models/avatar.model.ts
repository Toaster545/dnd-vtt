export interface AvatarRecipeV1 {
  schemaVersion: 1;
  styleId: string;
  styleVersion: number;
  seed: string;
  parts: Record<string, string[]>;
  colors: Record<string, string>;
}

export type PortraitSource =
  | { kind: 'legacy'; seed: string }
  | { kind: 'recipe'; recipe: AvatarRecipeV1; fallbackSeed: string };

export interface AvatarPartDefinition {
  id: string;
  label: string;
  weight?: number;
  occupies?: string[];
  conflictsWith?: string[];
}

export interface AvatarCategoryDefinition {
  id: string;
  label: string;
  minSelections: number;
  maxSelections: number;
  noneWeight?: number;
  parts: readonly AvatarPartDefinition[];
}

export interface AvatarColorDefinition {
  id: string;
  label: string;
  default: string;
  palette: readonly string[];
}

export interface AvatarStyleDefinition {
  id: string;
  version: number;
  label: string;
  categories: readonly AvatarCategoryDefinition[];
  colors: readonly AvatarColorDefinition[];
}
