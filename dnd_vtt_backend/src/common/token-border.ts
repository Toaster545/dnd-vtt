// A character's battle-map token ring, picked in the portrait dialog (see the frontend's
// core/utils/token-border.ts, which draws it). Stored on the character's data blob as
// `token_border`; anything that doesn't match this exact shape is rejected rather than
// passed through to every viewer's canvas.
export interface TokenBorder {
  color: string;
  // Thickness level, a whole number from 1 to 10 (the dialog's slider).
  width: number;
  pattern: 'solid' | 'double' | 'dashed' | 'dotted';
  // Inner-edge color of a gradient fading in from `color` on the outer edge; null for one color.
  gradientColor: string | null;
  // Accent stripe within the ring; null for none.
  bandColor: string | null;
  // Fill behind the portrait; null for none.
  backgroundColor: string | null;
  material: 'flat' | 'metal' | 'studded';
  // Portrait zoom inside the ring, a whole percentage from 80 to 150.
  faceScale: number;
}

// Borders saved before thickness became a slider stored a named size instead.
const LEGACY_WIDTHS: Record<string, number> = { thin: 2, normal: 5, thick: 8 };
const PATTERNS: readonly string[] = ['solid', 'double', 'dashed', 'dotted'];
const MATERIALS: readonly string[] = ['flat', 'metal', 'studded'];

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// null when absent, undefined when present but invalid.
function optionalHex(value: unknown): string | null | undefined {
  if (value == null) return null;
  return isHex(value) ? value.toLowerCase() : undefined;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
  );
}

// Fields added after the first version (band, background, material, face scale) default when
// missing, so borders saved earlier keep working; a present-but-invalid value still rejects.
export function parseTokenBorder(value: unknown): TokenBorder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isHex(raw.color)) return null;
  const width =
    typeof raw.width === 'string' ? LEGACY_WIDTHS[raw.width] : raw.width;
  if (!inRange(width, 1, 10)) return null;
  if (typeof raw.pattern !== 'string' || !PATTERNS.includes(raw.pattern)) {
    return null;
  }
  const material = raw.material ?? 'flat';
  if (typeof material !== 'string' || !MATERIALS.includes(material)) {
    return null;
  }
  const faceScale = raw.faceScale ?? 100;
  if (!inRange(faceScale, 80, 150)) return null;
  const gradientColor = optionalHex(raw.gradientColor);
  const bandColor = optionalHex(raw.bandColor);
  const backgroundColor = optionalHex(raw.backgroundColor);
  if (
    gradientColor === undefined ||
    bandColor === undefined ||
    backgroundColor === undefined
  ) {
    return null;
  }
  return {
    color: raw.color.toLowerCase(),
    width,
    pattern: raw.pattern as TokenBorder['pattern'],
    gradientColor,
    bandColor,
    backgroundColor,
    material: material as TokenBorder['material'],
    faceScale,
  };
}
