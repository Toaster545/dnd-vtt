import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';

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
    path: 'battle-map',
    canActivate: [authGuard],
    loadComponent: () => import('./features/battle-map/battle-map').then(m => m.BattleMapComponent),
  },
  {
    path: 'battle-map/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/battle-map/battle-map').then(m => m.BattleMapComponent),
  },
  {
    path: 'dm',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/dm/dm-shell').then(m => m.DmShellComponent),
    children: [
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaigns').then(m => m.DmCampaignsComponent),
      },
      {
        path: 'campaigns/:campaignId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-hub/dm-campaign-hub').then(m => m.DmCampaignHubComponent),
      },
      {
        path: 'campaigns/:campaignId/sessions/:sessionId',
        loadComponent: () =>
          import('./features/dm/dm-campaigns/dm-campaign-session/dm-campaign-session').then(
            m => m.DmCampaignSessionComponent,
          ),
      },
    ],
  },
  {
    path: 'player',
    canActivate: [authGuard],
    loadComponent: () => import('./features/player/player-shell').then(m => m.PlayerShellComponent),
    children: [
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./features/player/player-campaigns/player-campaigns').then(m => m.PlayerCampaignsComponent),
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
  {
    path: 'admin/maps',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/map-manager').then(m => m.MapManagerComponent),
  },
  { path: '**', canActivate: [homeRedirectGuard], children: [] },
];
