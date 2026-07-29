import type { RequestUser } from '../common/current-user.decorator';

// JwtGuard attaches the authenticated profile to the request; every downstream guard/decorator
// (AdminGuard, CurrentUser) reads it back through this shared augmentation instead of `any`.
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
