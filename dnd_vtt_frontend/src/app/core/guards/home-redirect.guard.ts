import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

// Sends '' and unmatched paths straight to the signed-in user's landing page. Every logged-in
// user lands on the same /dashboard now — DM vs player was never a property of the account, just
// of whether a given campaign's dm_id happens to match you (see CampaignsComponent).
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.ready).pipe(
    map(() => {
      if (!auth.isLoggedIn()) return router.createUrlTree(['/auth/login']);
      return router.createUrlTree(['/home/dashboard']);
    }),
  );
};
