import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Must wait on auth.ready (same as authGuard) rather than reading isAdmin() synchronously —
  // otherwise this can fire before the profile finishes loading from /auth/me and bounce an
  // actual admin to /player before their role is known.
  return from(auth.ready).pipe(
    map(() => (auth.isAdmin() ? true : router.createUrlTree(['/player']))),
  );
};
