// Single home for environment-derived settings. ConfigModule loads `.env` into process.env
// while AppModule is being imported, so everything here is a function that reads process.env
// lazily rather than a constant captured at import time.

const DEFAULT_CORS_ORIGINS =
  'http://localhost:4200,https://dnd.mathomelab.ca,https://localhost,capacitor://localhost';

export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim());
}

// Options shared by REST (`app.enableCors`) and both socket.io gateways, so an origin is added
// in exactly one place.
export function corsOptions() {
  return { origin: corsOrigins(), credentials: true };
}

export function dbPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.DB_PATH ?? './data/dnd.db';
}

// DEV_BYPASS=true: the bearer token "dev" is accepted as the first admin (JwtGuard,
// SocketAuthService) and static assets are served uncached. Never expose such a server.
export function isDevBypass(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_BYPASS === 'true';
}

// Deliberately broader than isDevBypass: also true for NODE_ENV=development|test. Used only to
// decide whether the JWT secret may fall back to a well-known value (jwt-secret.ts); it does
// not enable the "dev" token.
export function isDevRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isDevBypass(env) ||
    env.NODE_ENV === 'development' ||
    env.NODE_ENV === 'test'
  );
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}
