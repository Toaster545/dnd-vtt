import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
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
  },
  {
    path: 'player',
    canActivate: [authGuard],
    loadComponent: () => import('./features/player/player-shell').then(m => m.PlayerShellComponent),
  },
  {
    path: 'admin/maps',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/map-manager').then(m => m.MapManagerComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
