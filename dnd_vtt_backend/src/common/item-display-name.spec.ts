import { itemDisplayName } from './item-display-name';

describe('itemDisplayName', () => {
  it('handles plain, positive, negative, zero, bad and missing', () => {
    expect(itemDisplayName({ name: 'Longsword' })).toBe('Longsword');
    expect(itemDisplayName({ name: 'Longsword', enhancement_bonus: 1 })).toBe(
      'Longsword +1',
    );
    expect(itemDisplayName({ name: 'Dagger', enhancement_bonus: -1 })).toBe(
      'Dagger -1',
    );
    expect(itemDisplayName({ name: 'Dagger', enhancement_bonus: 0 })).toBe(
      'Dagger',
    );
    expect(itemDisplayName({ name: 'Dagger', enhancement_bonus: '2' })).toBe(
      'Dagger',
    );
    expect(itemDisplayName({})).toBe('');
  });
});
