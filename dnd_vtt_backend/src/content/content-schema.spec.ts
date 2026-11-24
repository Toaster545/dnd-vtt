import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Content JSON is loaded untyped (`as T`), so these checks are the only guard against authoring
// slips. Convention: original SRD-style fields are snake_case, the TraitGrant/effect vocabulary
// added later is camelCase. Spells and monsters predate that vocabulary and are snake_case only.
const CONTENT = join(process.cwd(), 'content');
const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function files(dir: string): string[] {
  return readdirSync(join(CONTENT, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(CONTENT, dir, f));
}

describe('content JSON schema conventions', () => {
  for (const dir of [
    'spells',
    'monsters',
    'classes',
    'feats',
    'races',
    'items',
  ]) {
    if (!statSync(join(CONTENT, dir), { throwIfNoEntry: false })?.isDirectory())
      continue;

    it(`${dir}: every entity has a kebab-case index matching its file name`, () => {
      const bad: string[] = [];
      for (const file of files(dir)) {
        const data = JSON.parse(readFileSync(file, 'utf8')) as {
          index?: unknown;
        };
        const name = file
          .split('/')
          .pop()!
          .replace(/\.json$/, '');
        if (
          typeof data.index !== 'string' ||
          !KEBAB.test(data.index) ||
          data.index !== name
        )
          bad.push(`${dir}/${name}: index=${String(data.index)}`);
      }
      expect(bad).toEqual([]);
    });
  }

  for (const dir of ['spells', 'monsters']) {
    it(`${dir}: top-level keys are snake_case only`, () => {
      const bad: string[] = [];
      for (const file of files(dir)) {
        const data = JSON.parse(readFileSync(file, 'utf8')) as Record<
          string,
          unknown
        >;
        for (const key of Object.keys(data))
          if (!SNAKE.test(key)) bad.push(`${file.split('/').pop()}: ${key}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
