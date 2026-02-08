import { Routes } from '@angular/router';
import { AlertasEventosPage } from './pages/alertas-eventos/alertas-eventos.page';
import { GestionAvisosPage } from './pages/gestion-avisos/gestion-avisos.page';
import { RecordatoriosPage } from './pages/recordatorios/recordatorios.page';
import { PerfilUsuarioPage } from './pages/perfil-usuario/perfil-usuario.page';

export const routes: Routes = [
  
  { path: '', redirectTo: 'alertas-eventos', pathMatch: 'full' },
  { path: 'alertas-eventos', component: AlertasEventosPage },
  { path: 'gestion-avisos', component: GestionAvisosPage },
  { path: 'recordatorios', component: RecordatoriosPage },
  { path: 'perfil-usuario', component: PerfilUsuarioPage },
];
