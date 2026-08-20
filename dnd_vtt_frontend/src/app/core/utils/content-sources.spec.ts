import { describe, expect, it } from 'vitest';
import type { DndContentSource } from '../services/content.service';
import { campaignContentEnabled, characterContentEnabled } from './content-sources';

function source(
  code: string,
  name: string,
  playerOptions: boolean,
  locked: boolean,
): DndContentSource {
  return {
    code,
    name,
    short_name: code,
    edition: 2024,
    description: '',
    default_enabled: locked,
    locked,
    player_options: playerOptions,
    requires: [],
  };
}

const sources: DndContentSource[] = [
  source('XPHB', "Player's Handbook", true, true),
  source('EFA', 'Eberron: Forge of the Artificer', true, false),
  source('XGE', "Xanathar's Guide to Everything", true, false),
  source('TCE', "Tasha's Cauldron of Everything", true, false),
  source('XMM', 'Monster Manual', false, false),
  source('HOMEBREW', 'Homebrew', false, false),
];

describe('content source gates', () => {
  it('always includes locked core and homebrew character content', () => {
    expect(characterContentEnabled({ source: { code: 'XPHB' } }, new Set(), sources)).toBe(true);
    expect(characterContentEnabled({ source: { code: 'HOMEBREW' } }, new Set(), sources)).toBe(true);
  });

  it.each(['EFA', 'XGE', 'TCE'])('only includes optional %s character content when selected', (code) => {
    expect(characterContentEnabled({ source: { code } }, new Set(), sources)).toBe(false);
    expect(characterContentEnabled({ source: { code } }, new Set([code]), sources)).toBe(true);
  });

  it('keeps DM-only and homebrew encounter content available while gating player books', () => {
    expect(campaignContentEnabled({ source: { code: 'XMM' } }, new Set(), sources)).toBe(true);
    expect(campaignContentEnabled({ source: { code: 'HOMEBREW' } }, new Set(), sources)).toBe(true);
    expect(campaignContentEnabled({ source: { code: 'EFA' } }, new Set(), sources)).toBe(false);
    expect(campaignContentEnabled({ source: { code: 'EFA' } }, new Set(['EFA']), sources)).toBe(true);
    expect(campaignContentEnabled({ source: { code: 'XGE' } }, new Set(), sources)).toBe(false);
    expect(campaignContentEnabled({ source: { code: 'TCE' } }, new Set(), sources)).toBe(false);
    expect(campaignContentEnabled({ source: { code: 'TCE' } }, new Set(['TCE']), sources)).toBe(true);
  });
});
