import { normalizeTokenBorder } from './token-border';
import { normalizeAvatarRecipe } from './avatar';
import { characterContentEnabled } from './content-sources';
import { averageHpFormula } from './character-effects';
import type { DndContentSource } from '../services/content.service';

import tokenBorderFixture from '../../../../../parity-fixtures/token-border.json';
import avatarFixture from '../../../../../parity-fixtures/avatar-recipe.json';
import sourcesFixture from '../../../../../parity-fixtures/content-sources.json';
import averageHpFixture from '../../../../../parity-fixtures/average-hp.json';

// Shared with the backend's common/parity.spec.ts: both read the same hand-written fixtures.
interface Case<I, E> {
  name: string;
  input: I;
  expected: E;
}
const load = <I, E>(fixture: unknown) => (fixture as { cases: Case<I, E>[] }).cases;

describe('frontend/backend parity fixtures', () => {
  for (const c of load(tokenBorderFixture)) {
    it(`token-border: ${c.name}`, () => {
      expect(normalizeTokenBorder(c.input)).toEqual(c.expected);
    });
  }

  // Only cases both sides agree on: the backend rejects incomplete recipes, the frontend repairs
  // them (by design), so the fixture sticks to valid and unambiguously invalid input.
  for (const c of load(avatarFixture)) {
    it(`avatar-recipe: ${c.name}`, () => {
      expect(normalizeAvatarRecipe(c.input)).toEqual(c.expected);
    });
  }

  const sources = sourcesFixture.sources as DndContentSource[];
  for (const c of load<{ enabled: string[] }, Record<string, boolean>>(sourcesFixture)) {
    it(`content-sources: ${c.name}`, () => {
      const enabled = new Set(c.input.enabled);
      for (const [code, on] of Object.entries(c.expected)) {
        expect(characterContentEnabled({ source: { code } }, enabled, sources)).toBe(on);
      }
    });
  }

  for (const c of load<{ level: number; hitDie: number; conMod: number }, number>(
    averageHpFixture,
  )) {
    it(`average-hp: ${c.name}`, () => {
      expect(averageHpFormula(c.input.level, c.input.hitDie, c.input.conMod)).toBe(c.expected);
    });
  }
});
