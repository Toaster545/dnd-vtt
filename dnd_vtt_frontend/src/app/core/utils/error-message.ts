// Narrows a caught `unknown` (catch clause variables aren't typed `any` under strict TS) down to a
// displayable string. Prefers the backend's reason (Nest puts it in the response body as
// `error.message`, a string or — for validation failures — an array of strings), then the error's own
// `.message` (plain Errors and Angular's HttpErrorResponse), then `fallback`.
export function getErrorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e && typeof e === 'object') {
    const body = (e as { error?: unknown }).error;
    if (body && typeof body === 'object' && 'message' in body) {
      const m = (body as { message?: unknown }).message;
      if (typeof m === 'string' && m) return m;
      if (Array.isArray(m) && m.length) return m.join(' ');
    }
    if ('message' in e && typeof e.message === 'string' && e.message) return e.message;
  }
  return fallback;
}
