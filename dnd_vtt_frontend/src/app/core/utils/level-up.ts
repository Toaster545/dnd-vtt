import { Character } from '../models/character.model';

// The self-serve Level-Up flow (a route + POST /characters/:id/level-up) lets a player record
// the choices for a level the DM granted them — HP, class/subclass features, ASI/feat, spells —
// even on a DM-locked campaign copy. It's one-shot per level bump: once applied, `applied_level`
// is stamped to the character's `level` and the flow refuses to reopen.
//
// `applied_level` is absent on characters created before the flow existed. For those we fall
// back to a heuristic: a stored max_hp that still matches the average-progression value for the
// current level (or an explicit player override) means the sheet was last saved *at* this level,
// so nothing is pending; a mismatch means the level changed since the last wizard save, so treat
// exactly one level as pending.
export function levelUpBaseline(char: Pick<Character,
  'level' | 'applied_level' | 'max_hp' | 'max_hp_overridden'>, suggestedMaxHp: number): number {
  if (char.applied_level != null) return char.applied_level;
  const caughtUp = char.max_hp_overridden || suggestedMaxHp === char.max_hp;
  return caughtUp ? char.level : Math.max(1, char.level - 1);
}

export function levelUpPending(char: Pick<Character,
  'level' | 'applied_level' | 'max_hp' | 'max_hp_overridden'>, suggestedMaxHp: number): boolean {
  return levelUpBaseline(char, suggestedMaxHp) < char.level;
}
