import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Entry {
  name: string;
  description: string;
}

interface MonsterFile {
  index: string;
  name: string;
  size: string;
  armor_class: number;
  hit_points: number;
  hit_dice: string;
  ability_scores: Record<string, number>;
  senses: { passive_perception: number };
  languages: string[];
  challenge_rating: string;
  xp: number;
  traits?: Entry[];
  actions?: Entry[];
  bonus_actions?: Entry[];
  reactions?: Entry[];
  legendary_actions?: Entry[];
  source?: { code: string; srd_5_2_1?: boolean };
}

// 2024 rules, "Experience Points by Challenge Rating" (SRD 5.2.1).
const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

const folder = join(process.cwd(), 'content', 'monsters');
const files = readdirSync(folder).filter((file) => file.endsWith('.json'));
const monsters = files.map((file) => ({
  file,
  monster: JSON.parse(readFileSync(join(folder, file), 'utf8')) as MonsterFile,
}));
const srd = monsters.filter(({ monster }) => monster.source?.srd_5_2_1);

describe('SRD 5.2.1 bestiary', () => {
  it('covers every stat block in Monsters A-Z and the Animals appendix', () => {
    expect(srd).toHaveLength(330);
  });

  it('has no duplicate creature names', () => {
    const names = monsters.map(({ monster }) => monster.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it.each(srd.map(({ file, monster }) => [monster.name, file, monster]))(
    '%s is a well-formed stat block',
    (_name, file, monster) => {
      expect(`${monster.index}.json`).toBe(file);
      expect(monster.source?.code).toBe('XMM');
      expect(monster.armor_class).toBeGreaterThan(0);
      expect(monster.hit_points).toBeGreaterThan(0);
      expect(monster.hit_dice).toMatch(/^\d+d\d+( [+-] \d+)?$/);
      expect(Object.keys(monster.ability_scores)).toHaveLength(6);
      expect(monster.senses.passive_perception).toBeGreaterThan(0);
      expect(Array.isArray(monster.languages)).toBe(true);
      // Shrieker Fungus is all reactions, no actions.
      expect(
        (monster.actions?.length ?? 0) + (monster.reactions?.length ?? 0),
      ).toBeGreaterThan(0);
      const expectedXp = XP_BY_CR[monster.challenge_rating];
      expect(expectedXp).toBeDefined();
      // CR 0 creatures are worth 0 or 10 XP depending on whether they can attack.
      expect(
        monster.xp === expectedXp ||
          (monster.challenge_rating === '0' && monster.xp === 0),
      ).toBe(true);
      const entries = [
        ...(monster.traits ?? []),
        ...(monster.actions ?? []),
        ...(monster.bonus_actions ?? []),
        ...(monster.reactions ?? []),
        ...(monster.legendary_actions ?? []),
      ];
      for (const entry of entries) {
        expect(entry.name.trim()).toBe(entry.name);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    },
  );
});
