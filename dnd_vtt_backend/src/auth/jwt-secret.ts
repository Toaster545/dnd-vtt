import { isDevRun } from '../config';

const DEV_FALLBACK_SECRET = 'change-me';
const PLACEHOLDER_SECRETS = new Set([
  DEV_FALLBACK_SECRET,
  'change-this-to-a-long-random-string',
  'some-long-random-string',
]);

/**
 * Resolves the JWT signing secret. Only an explicit dev/test run (DEV_BYPASS=true or
 * NODE_ENV=development|test) may fall back to a well-known secret; anywhere else a missing or
 * placeholder secret would let anyone forge tokens, so refuse to start.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (secret && !PLACEHOLDER_SECRETS.has(secret)) return secret;
  if (isDevRun(env)) return secret || DEV_FALLBACK_SECRET;
  throw new Error(
    'JWT_SECRET is missing or still a placeholder value. Set it to a long random string ' +
      '(see .env.example) before starting outside of dev mode.',
  );
}
