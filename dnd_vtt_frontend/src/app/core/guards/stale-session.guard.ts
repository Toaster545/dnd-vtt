import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ActivityService } from '../services/activity.service';

const IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

// If the app hasn't been touched in a while and the user hard-refreshes (or reopens the tab),
// send them to the dashboard instead of resuming whatever deep link they had open — a router
// navigation's id is only 1 for the very first navigation since app bootstrap, so this can never
// fire on an in-app routerLink click, only on an actual page load. Every guarded navigation
// re-touches the activity clock, stale or not, so normal use keeps pushing it forward.
export const staleSessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const activity = inject(ActivityService);
  const router = inject(Router);

  return from(auth.ready).pipe(
    map(() => {
      if (!auth.isLoggedIn()) return true;

      const nav = router.getCurrentNavigation();
      if (nav?.id === 1 && activity.isStale(IDLE_THRESHOLD_MS)) {
        activity.touch();
        return router.createUrlTree(['/dashboard']);
      }
      activity.touch();
      return true;
    }),
  );
};
