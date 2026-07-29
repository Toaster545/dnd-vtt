import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';

export function portraitDataUri(seed: string): string {
  return createAvatar(lorelei, { seed }).toDataUri();
}

export function randomPortraitSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
