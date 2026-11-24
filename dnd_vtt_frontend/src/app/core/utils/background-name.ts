export const BACKGROUND_CUSTOM_NAME_KEY = 'background_custom_name';
export const BACKGROUND_CUSTOM_NAME_MAX_LENGTH = 80;

export function customBackgroundName(
  baseName: string,
  choices: Record<string, string[]> | null | undefined,
): string | null {
  const candidate = choices?.[BACKGROUND_CUSTOM_NAME_KEY]?.[0]?.trim() ?? '';
  if (!candidate || candidate.length > BACKGROUND_CUSTOM_NAME_MAX_LENGTH) return null;
  return candidate.localeCompare(baseName.trim(), undefined, { sensitivity: 'accent' }) === 0
    ? null
    : candidate;
}

export function backgroundDisplayName(
  baseName: string,
  choices: Record<string, string[]> | null | undefined,
): string {
  return customBackgroundName(baseName, choices) ?? baseName;
}

export function hasCustomBackgroundName(
  baseName: string,
  choices: Record<string, string[]> | null | undefined,
): boolean {
  return customBackgroundName(baseName, choices) !== null;
}
