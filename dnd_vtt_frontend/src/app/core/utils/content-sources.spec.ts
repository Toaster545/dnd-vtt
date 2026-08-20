import { describe, expect, it } from 'vitest';
import type { DndContentSource } from '../services/content.service';
import { characterContentEnabled } from './content-sources';

const sources: DndContentSource[] = [
  { code: 'XPHB', name: 'PHB', short_name: 'PHB', edition: 2024, description: '', default_enabled: true, locked: true, player_options: true, requires: [] },
  { code: 'XGE', name: 'XGE', short_name: 'XGE', edition: 2017, description: '', default_enabled: false, locked: false, player_options: true, requires: ['XPHB'] },
];

describe('character content source gate', () => {
  it('keeps core content available and gates optional books', () => {
    expect(characterContentEnabled({ source: { code: 'XPHB' } }, new Set(), sources)).toBe(true);
    expect(characterContentEnabled({ source: { code: 'XGE' } }, new Set(), sources)).toBe(false);
    expect(characterContentEnabled({ source: { code: 'XGE' } }, new Set(['XGE']), sources)).toBe(true);
  });
});
