import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Opts a route out of a class-level JwtGuard. Controllers are guarded by default; a route that
// is meant to be readable without logging in (static SRD reads) must say so explicitly.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
