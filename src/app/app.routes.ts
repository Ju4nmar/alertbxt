import { Routes } from '@angular/router';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'alertas-eventos', pathMatch: 'full' },
  {
    path: 'alertas-eventos',
    loadComponent: () => import('./pages/alertas-eventos/alertas-eventos.page').then(m => m.AlertasEventosPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'gestion-avisos',
    loadComponent: () => import('./pages/gestion-avisos/gestion-avisos.page').then(m => m.GestionAvisosPage),
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'admin' },
    providers: [
      provideStorage(() => getStorage()),
    ],
  },
  {
    path: 'gestion-usuarios',
    loadComponent: () => import('./pages/gestion-usuarios/gestion-usuarios.page').then(m => m.GestionUsuariosPage),
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'admin' },
  },
  {
    path: 'recordatorios',
    loadComponent: () => import('./pages/recordatorios/recordatorios.page').then(m => m.RecordatoriosPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'perfil-usuario',
    loadComponent: () => import('./pages/perfil-usuario/perfil-usuario.page').then(m => m.PerfilUsuarioPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./pages/registro/registro.page').then(m => m.RegistroPage),
  },
  {
    path: 'unirse-vecindad',
    loadComponent: () => import('./pages/unirse-vecindad/unirse-vecindad.page').then(m => m.UnirseVecindadPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage),
  },
  { path: '**', redirectTo: 'alertas-eventos' },
];
