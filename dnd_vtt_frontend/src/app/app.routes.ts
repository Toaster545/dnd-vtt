import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';
import { staleSessionGuard } from './core/guards/stale-session.guard';
import { levelUpPendingGuard } from './core/guards/level-up-pending.guard';

export const routes: Routes = [
  { path: '', canActivate: [homeRedirectGuard], children: [] },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register').then(m => m.RegisterComponent),
      },
    ],
  },
  {
    path: 'dashboard',
    redirectTo: 'home/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'battle-map',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/battle-map/battle-map').then(m => m.BattleMapComponent),
  },
  {
    path: 'battle-map/:id',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/battle-map/battle-map').then(m => m.BattleMapComponent),
  },
  {
    path: 'encounters/:encounterId/player-view',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/player-view/player-view').then(m => m.PlayerViewComponent),
    // Fully opaque — this screen is just the map, and the app-wide Settings background would
    // otherwise show through around it.
    data: { bgOverlay: 1 },
  },
  {
    path: 'home',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/shell/shell').then(m => m.ShellComponent),
    children: [
      {
        path: '',
        redirectTo: 'characters',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
        data: { bgOverlay: 0.6 },
      },
      {
        path: 'characters',
        loadComponent: () => import('./features/characters/characters').then(m => m.CharactersComponent),
      },
      {
        path: 'campaign/current',
        loadComponent: () => import('./features/player/current-player-route/current-player-route').then(m => m.CurrentPlayerRouteComponent),
        data: { target: 'campaign', bgOverlay: 0.9 },
      },
      {
        path: 'campaign/current-session',
        loadComponent: () => import('./features/player/current-player-route/current-player-route').then(m => m.CurrentPlayerRouteComponent),
        data: { target: 'session', bgOverlay: 0.9 },
      },
      {
        path: 'campaign/current-encounter',
        loadComponent: () => import('./features/player/current-player-route/current-player-route').then(m => m.CurrentPlayerRouteComponent),
        data: { target: 'encounter', bgOverlay: 1 },
      },
      {
        path: 'campaign/current-map',
        loadComponent: () => import('./features/player/current-player-route/current-player-route').then(m => m.CurrentPlayerRouteComponent),
        data: { target: 'map', bgOverlay: 1 },
      },
      {
        path: 'characters/new',
        loadComponent: () =>
          import('./features/characters/character-wizard-page/character-wizard-page').then(
            m => m.CharacterWizardPageComponent,
          ),
        data: { bgOverlay: 0.6 },
      },
      {
        path: 'characters/:id/edit',
        loadComponent: () =>
          import('./features/characters/character-wizard-page/character-wizard-page').then(
            m => m.CharacterWizardPageComponent,
          ),
        data: { bgOverlay: .9 },
      },
      {
        path: 'characters/:id/level-up',
        canActivate: [levelUpPendingGuard],
        loadComponent: () =>
          import('./features/characters/character-level-up-page/character-level-up-page').then(
            m => m.CharacterLevelUpPageComponent,
          ),
        data: { bgOverlay: .9 },
      },
      {
        path: 'characters/:id',
        loadComponent: () =>
          import('./features/characters/character-sheet-page/character-sheet-page').then(
            m => m.CharacterSheetPageComponent,
          ),
        data: { bgOverlay: 0.9 },
      },
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./features/campaigns/campaigns').then(m => m.CampaignsComponent),
      },
      {
        path: 'campaigns/manage/:campaignId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-hub/dm-campaign-hub').then(m => m.DmCampaignHubComponent),
        data: { bgOverlay: 0.9 },
      },
      {
        path: 'content-library',
        loadComponent: () =>
          import('./features/create-content/create-content').then(m => m.CreateContentComponent),
      },
      {
        path: 'campaigns/manage/:campaignId/maps',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-maps/dm-campaign-maps').then(
            m => m.DmCampaignMapsComponent,
          ),
          data: { bgOverlay: 0.9 },
      },
      {
        path: 'campaigns/manage/:campaignId/sessions/:sessionId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-session/dm-campaign-session').then(
            m => m.DmCampaignSessionComponent,
          ),
          data: { bgOverlay: 0.9 },
      },
      {
        path: 'campaigns/manage/:campaignId/sessions/:sessionId/encounters/:encounterId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-encounter-play/dm-encounter-play').then(
            m => m.DmEncounterPlayComponent,
          ),
        // Fully opaque — the app-wide Settings background would otherwise show through around
        // the map/roster; the session hub this is launched from keeps its own overlay.
        data: { bgOverlay: 1 },
      },
      {
        path: 'campaigns/:campaignId',
        loadComponent: () =>
          import('./features/player/player-campaigns/player-campaign-hub/player-campaign-hub').then(
            m => m.PlayerCampaignHubComponent,
          ),
          data: { bgOverlay: 0.9 },
      },
      {
        path: 'campaigns/:campaignId/sessions/:sessionId',
        loadComponent: () =>
          import('./features/player/player-campaigns/player-campaign-session/player-campaign-session').then(
            m => m.PlayerCampaignSessionComponent,
          ),
      },
    ],
  },
  { path: '**', canActivate: [homeRedirectGuard], children: [] },
];
