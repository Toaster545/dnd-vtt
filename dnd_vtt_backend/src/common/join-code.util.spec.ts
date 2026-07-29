import { generateJoinCode } from './join-code.util';

describe('generateJoinCode', () => {
  it('defaults to a 6-character code', () => {
    expect(generateJoinCode()).toHaveLength(6);
  });

  it('honors a custom length', () => {
    expect(generateJoinCode(10)).toHaveLength(10);
  });

  it('only uses unambiguous characters (no 0/O/1/I, read aloud by a DM)', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode(20);
      for (const char of code) {
        expect(alphabet).toContain(char);
      }
    }
  });

  it('is randomized rather than constant', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateJoinCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
