// Narrows a caught `unknown` (catch clause variables aren't typed `any` under
// strict TS) down to a displayable string. Covers both plain Errors and Angular's
// HttpErrorResponse, which carries a `.message` without extending the real Error class.
export function getErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    return e.message;
  }
  return 'Something went wrong';
}
