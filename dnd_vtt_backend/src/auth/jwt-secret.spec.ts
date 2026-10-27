import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  it('returns a real secret as-is', () => {
    expect(resolveJwtSecret({ JWT_SECRET: 'abc123xyz' })).toBe('abc123xyz');
  });

  it('throws when the secret is missing outside dev', () => {
    expect(() => resolveJwtSecret({})).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('throws on a placeholder secret outside dev', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'change-me' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('allows the fallback in dev and test runs', () => {
    expect(resolveJwtSecret({ DEV_BYPASS: 'true' })).toBe('change-me');
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe('change-me');
    expect(resolveJwtSecret({ NODE_ENV: 'test' })).toBe('change-me');
  });
});
