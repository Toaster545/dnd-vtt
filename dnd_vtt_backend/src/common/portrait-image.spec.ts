import { parsePortraitImage } from './portrait-image';

describe('parsePortraitImage', () => {
  it('accepts uploaded portrait URLs', () => {
    const url =
      '/uploads/portraits/0b6f9c1e-1111-4222-8333-444455556666/2f1c0f3e-0000-4000-8000-000000000000.webp';
    expect(parsePortraitImage(url)).toBe(url);
  });

  it('rejects other uploads, external URLs, and traversal', () => {
    for (const value of [
      '/uploads/maps/a/b.png',
      'https://example.com/a.png',
      '/uploads/portraits/../maps/b.png',
      '/uploads/portraits/a/b.svg',
      '/uploads/portraits/a/b.png?x=1',
      42,
      null,
    ]) {
      expect(parsePortraitImage(value)).toBeNull();
    }
  });
});
