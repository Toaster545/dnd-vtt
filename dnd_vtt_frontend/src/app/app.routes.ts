import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';
import { staleSessionGuard } from './core/guards/stale-session.guard';

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
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/settings/settings').then(m => m.SettingsComponent),
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
  // Single shell for every logged-in user — no more /dm vs /player split. Which of a campaign's
  // two hub views you land on is decided by ownership (see CampaignsComponent.campaignLink), not
  // by a route-level role guard: 'campaigns/manage/...' is the owning-DM view (still gated inside
  // each backend endpoint by campaign.dm_id, not by adminGuard), 'campaigns/:campaignId' is the
  // joined-member view.
  {
    path: 'home',
    canActivate: [authGuard, staleSessionGuard],
    loadComponent: () => import('./features/shell/shell').then(m => m.ShellComponent),
    children: [
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./features/campaigns/campaigns').then(m => m.CampaignsComponent),
      },
      {
        path: 'campaigns/manage/:campaignId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-hub/dm-campaign-hub').then(m => m.DmCampaignHubComponent),
      },
      {
        path: 'campaigns/manage/:campaignId/create',
        loadComponent: () =>
          import('./features/create-content/create-content').then(m => m.CreateContentComponent),
      },
      {
        path: 'campaigns/manage/:campaignId/maps',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-maps/dm-campaign-maps').then(
            m => m.DmCampaignMapsComponent,
          ),
      },
      {
        path: 'campaigns/manage/:campaignId/sessions/:sessionId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-session/dm-campaign-session').then(
            m => m.DmCampaignSessionComponent,
          ),
      },
      {
        path: 'campaigns/manage/:campaignId/sessions/:sessionId/encounters/:encounterId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-encounter-play/dm-encounter-play').then(
            m => m.DmEncounterPlayComponent,
          ),
      },
      {
        path: 'campaigns/:campaignId',
        loadComponent: () =>
          import('./features/player/player-campaigns/player-campaign-hub/player-campaign-hub').then(
            m => m.PlayerCampaignHubComponent,
          ),
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
