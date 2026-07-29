import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

// Sends '' and unmatched paths straight to the signed-in user's home area — replaces the old
// DashboardComponent, which existed only to do this same role check after a render.
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.ready).pipe(
    map(() => {
      if (!auth.isLoggedIn()) return router.createUrlTree(['/auth/login']);
      return router.createUrlTree([auth.isAdmin() ? '/dm' : '/player']);
    }),
  );
};
