import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthTokenService } from '../services/auth-token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(AuthTokenService);
  const token = tokens.accessToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  req = req.clone({ withCredentials: true });
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/refresh')
      ) {
        return throwError(() => error);
      }
      return from(tokens.refresh()).pipe(
        switchMap((session) => {
          if (!session) return throwError(() => error);
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${session.access_token}` },
            }),
          );
        }),
      );
    }),
  );
};
