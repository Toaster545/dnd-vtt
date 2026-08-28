import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CharacterService } from '../services/character.service';

// Guards /home/characters/:id/level-up. The self-serve Level-Up flow is one-shot: once a
// player has applied the level the DM granted, `applied_level` catches up to `level` and there's
// nothing left to do, so bounce them to the character sheet. Legacy copies with no marker are
// let through (the backend's HP-staleness check has the final say, and the page surfaces its
// "no level-up is pending" response). Entry points only *show* the link when a level-up is
// actually pending — this guard just stops a stale/bookmarked URL from reopening a finished one.
export const levelUpPendingGuard: CanActivateFn = async (route) => {
  const characterService = inject(CharacterService);
  const router = inject(Router);

  const id = route.paramMap.get('id');
  if (!id) return router.parseUrl('/home/characters');

  try {
    const character = await characterService.getCharacter(id);
    const pending = character.applied_level == null || character.applied_level < character.level;
    return pending ? true : router.parseUrl(`/home/characters/${id}`);
  } catch {
    return router.parseUrl('/home/characters');
  }
};
