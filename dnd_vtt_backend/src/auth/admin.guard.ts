import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// Authorization conventions (the only three styles in use):
//  1. JwtGuard (class-level; opt out per route with @Public()) — "you are logged in".
//  2. AdminGuard — app-wide admin actions with no owning campaign (user management).
//  3. Ownership checks in services (`campaign.dm_id === user.id`) — everything campaign-scoped,
//     so any registered user can DM their own campaign. Sessions/encounters/campaigns
//     controllers intentionally have no AdminGuard for this reason.
// The one inline `user.role === 'admin'` check is MapsService's legacy 'default' campaign, which
// has no dm_id to compare against.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (user?.role !== 'admin') throw new ForbiddenException('Admin only');
    return true;
  }
}
