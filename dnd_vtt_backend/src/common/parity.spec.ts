import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTokenBorder } from './token-border';
import { parseAvatarRecipe } from './avatar-recipe';
import { normalizePlayerSources } from '../content/content-sources';
import { averageHp } from '../characters/average-hp';

// Shared with the frontend's core/utils/parity.spec.ts: both read the same hand-written
// fixtures so the mirrored implementations can't drift apart silently.
interface Case<I, E> {
  name: string;
  input: I;
  expected: E;
}
function load<I, E>(file: string): Case<I, E>[] {
  const path = join(process.cwd(), '..', 'parity-fixtures', file);
  return (JSON.parse(readFileSync(path, 'utf8')) as { cases: Case<I, E>[] })
    .cases;
}

describe('frontend/backend parity fixtures', () => {
  it.each(load('token-border.json'))('token-border: $name', (c) => {
    expect(parseTokenBorder(c.input)).toEqual(c.expected);
  });

  it.each(load('avatar-recipe.json'))('avatar-recipe: $name', (c) => {
    expect(parseAvatarRecipe(c.input)).toEqual(c.expected);
  });

  it.each(
    load<{ enabled: string[] }, Record<string, boolean>>(
      'content-sources.json',
    ),
  )('content-sources: $name', (c) => {
    const result = normalizePlayerSources(c.input.enabled);
    for (const [code, on] of Object.entries(c.expected)) {
      expect(result.includes(code)).toBe(on);
    }
  });

  it.each(
    load<{ level: number; hitDie: number; conMod: number }, number>(
      'average-hp.json',
    ),
  )('average-hp: $name', (c) => {
    expect(averageHp(c.input.level, c.input.hitDie, c.input.conMod)).toBe(
      c.expected,
    );
  });
});
