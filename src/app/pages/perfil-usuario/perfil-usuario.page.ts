import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonInput, IonItem, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { firstValueFrom, of, Subject, filter, switchMap, takeUntil } from 'rxjs';
import { Comunidad, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-perfil-usuario',
  templateUrl: './perfil-usuario.page.html',
  styleUrls: ['./perfil-usuario.page.scss'],
  standalone: true,
  imports: [IonButton, IonContent, IonInput, IonItem, IonSelect, IonSelectOption, CommonModule, FormsModule]
})
export class PerfilUsuarioPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly alertController = inject(AlertController);
  private readonly destroy$ = new Subject<void>();

  usuario: Usuario | null = null;
  comunidad: Comunidad | null = null;
  enlaceInvitacion = '';
  mensajeCopiado = '';
  mensajeGuardado = '';
  isSaving = false;
  isRequestingDeletion = false;
  mensajeEliminacion = '';

  nombre = '';
  correo = '';
  telefono = '';
  rol: 'admin' | 'residente' = 'residente';
  nombreComunidad = '';

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user),
      switchMap(user => {
        this.usuario = user;
        this.nombre = user!.nombre;
        this.correo = user!.correo;
        this.telefono = user!.telefono;
        this.rol = user!.rol;
        if (!user!.comunidadId) {
          this.comunidad = null;
          this.enlaceInvitacion = '';
          return of(null);
        }

        return this.firestoreService.getComunidadById(user!.comunidadId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: comunidad => {
        this.comunidad = comunidad;
        this.nombreComunidad = comunidad?.nombreComunidad || '';
        this.enlaceInvitacion = comunidad?.codigoInvitacion
          ? `${window.location.origin}/unirse-vecindad?codigo=${comunidad.codigoInvitacion}`
          : '';
      },
      error: error => console.error('Error cargando perfil:', error),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async copiarCodigo(): Promise<void> {
    if (!this.comunidad?.codigoInvitacion) {
      return;
    }

    await this.copiarTexto(this.comunidad.codigoInvitacion, 'Código copiado');
  }

  async copiarEnlace(): Promise<void> {
    if (!this.enlaceInvitacion) {
      return;
    }

    await this.copiarTexto(this.enlaceInvitacion, 'Enlace copiado');
  }

  async guardarPerfil(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    this.mensajeGuardado = '';
    const nombre = this.nombre.trim();
    const correo = this.correo.trim();
    const telefono = this.telefono.trim();
    const nombreComunidad = this.nombreComunidad.trim();

    if (!this.usuario || !nombre || !correo || !telefono) {
      this.mensajeGuardado = 'Completa todos los campos requeridos';
      return;
    }

    if (
      nombre.length < 3 || nombre.length > 80 ||
      correo.length > 120 ||
      telefono.length < 7 || telefono.length > 15 ||
      nombreComunidad.length > 60
    ) {
      this.mensajeGuardado = 'Revisa la longitud de los campos';
      return;
    }

    if (!this.isValidEmail(correo) || !this.isValidPhone(telefono)) {
      this.mensajeGuardado = 'Revisa el formato del correo o del teléfono.';
      return;
    }

    this.isSaving = true;

    const updatedUser: Usuario = {
      ...this.usuario,
      nombre,
      correo,
      telefono,
      rol: this.usuario.rol === 'admin' ? this.rol : this.usuario.rol,
    };

    try {
      await firstValueFrom(this.firestoreService.addUsuario(updatedUser));
      this.authService.setCurrentUser(updatedUser);
      this.usuario = updatedUser;

      if (this.usuario.rol === 'admin' && this.comunidad?.idComunidad && nombreComunidad) {
        await firstValueFrom(this.firestoreService.updateComunidad(this.comunidad.idComunidad, {
          nombreComunidad,
        }));
        this.comunidad = { ...this.comunidad, nombreComunidad };
      }

      this.mensajeGuardado = 'Perfil actualizado';
      setTimeout(() => this.mensajeGuardado = '', 2500);
    } catch (error) {
      console.error('Error guardando perfil:', error);
      this.mensajeGuardado = 'No se pudo guardar';
    } finally {
      this.isSaving = false;
    }
  }

  private async copiarTexto(texto: string, mensaje: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.mensajeCopiado = mensaje;
      setTimeout(() => this.mensajeCopiado = '', 2500);
    } catch (error) {
      console.error('Error copiando texto:', error);
      this.mensajeCopiado = 'No se pudo copiar';
    }
  }

  async solicitarEliminacionCuenta(): Promise<void> {
    if (!this.usuario || this.usuario.pendienteEliminacion || this.isRequestingDeletion) {
      return;
    }

    const alerta = await this.alertController.create({
      header: 'Solicitar eliminación de cuenta',
      message: 'La solicitud quedará registrada para revisión. La eliminación definitiva de tus datos será realizada posteriormente por el equipo administrador.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Confirmar solicitud', role: 'destructive', handler: () => this.enviarSolicitudEliminacion() },
      ],
    });
    await alerta.present();
  }

  private enviarSolicitudEliminacion(): void {
    this.isRequestingDeletion = true;
    this.mensajeEliminacion = '';

    this.authService.solicitarEliminacionCuenta()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.usuario) {
            this.usuario = { ...this.usuario, pendienteEliminacion: true };
          }
          this.mensajeEliminacion = 'Solicitud registrada. El equipo administrador realizará la baja definitiva.';
          this.isRequestingDeletion = false;
        },
        error: error => {
          console.error('Error solicitando eliminación de cuenta:', error);
          this.mensajeEliminacion = 'No se pudo registrar la solicitud. Intenta nuevamente.';
          this.isRequestingDeletion = false;
        },
      });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    return /^[0-9+ ]{7,15}$/.test(phone);
  }
}
