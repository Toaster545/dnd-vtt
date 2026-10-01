// How a character's battle-map token ring looks — picked in the portrait dialog, stored on the
// character as `token_border`, and drawn by core/utils/token-border.ts. Mirrors the backend's
// common/token-border.ts validation.
export type TokenBorderPattern = 'solid' | 'double' | 'dashed' | 'dotted';

export interface TokenBorder {
  color: string;
  // Thickness level, a whole number from TOKEN_BORDER_MIN_WIDTH to TOKEN_BORDER_MAX_WIDTH.
  width: number;
  pattern: TokenBorderPattern;
  // Inner-edge color of a gradient fading in from `color` on the outer edge; null for one color.
  gradientColor: string | null;
}
