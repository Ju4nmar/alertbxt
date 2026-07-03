import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, personCircle } from 'ionicons/icons';
import { Subject, distinctUntilChanged, filter, switchMap, takeUntil } from 'rxjs';
import { Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-gestion-usuarios',
  templateUrl: './gestion-usuarios.page.html',
  styleUrls: ['./gestion-usuarios.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonToolbar,
    CommonModule,
  ],
})
export class GestionUsuariosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  usuarios: Usuario[] = [];
  usuarioSeleccionado: Usuario | null = null;
  isLoading = false;
  modalAbierto = false;

  constructor() {
    addIcons({ personCircle, close });
  }

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.comunidadId && user?.rol === 'admin'),
        distinctUntilChanged((previous, current) => previous?.comunidadId === current?.comunidadId),
        switchMap(user => this.firestoreService.getUsuariosByComunidad(user!.comunidadId)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: usuarios => {
          this.usuarios = usuarios.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
          this.isLoading = false;
        },
        error: error => {
          console.error('Error cargando usuarios:', error);
          this.isLoading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  abrirDetalle(usuario: Usuario): void {
    this.usuarioSeleccionado = usuario;
    this.modalAbierto = true;
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.usuarioSeleccionado = null;
  }

  obtenerBadgeRol(rol?: string): { label: string; clase: string } {
    if (rol === 'admin') {
      return { label: 'Administrador', clase: 'badge-admin' };
    }
    return { label: 'Residente', clase: 'badge-residente' };
  }

  trackByUsuarioId(_: number, usuario: Usuario): string {
    return usuario.idUsuario || usuario.correo || usuario.nombre;
  }
}
