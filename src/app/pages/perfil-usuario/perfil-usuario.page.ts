import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonInput, IonItem, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { firstValueFrom, of, Subject, filter, switchMap, takeUntil } from 'rxjs';
import { Comunidad, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ThemeService, ThemePreference } from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';
import { isValidEmail, isValidPhone } from '../../utils/auth-form.utils';

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
  private readonly toastService = inject(ToastService);
  private readonly themeService = inject(ThemeService);
  private readonly destroy$ = new Subject<void>();

  usuario: Usuario | null = null;
  comunidad: Comunidad | null = null;
  enlaceInvitacion = '';
  temaActual: ThemePreference = this.themeService.getPreference();
  isSaving = false;
  isSavingVecindad = false;
  isRequestingDeletion = false;
  mensajeEliminacion = '';

  nombre = '';
  correo = '';
  telefono = '';
  numeroApartamento = '';
  torre = '';
  rol: 'admin' | 'residente' = 'residente';
  nombreComunidad = '';

  get esComunidadDeCasas(): boolean {
    return this.comunidad?.tipoComunidad === 'casas';
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user),
      switchMap(user => {
        this.usuario = user;
        this.nombre = user!.nombre;
        this.correo = user!.correo;
        this.telefono = user!.telefono;
        this.numeroApartamento = user!.numeroApartamento || '';
        this.torre = user!.torre || '';
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

    const nombre = this.nombre.trim();
    const correo = this.correo.trim();
    const telefono = this.telefono.trim();
    const numeroApartamento = this.numeroApartamento.trim();
    const torre = this.torre.trim();

    if (!this.usuario || !nombre || !correo || !telefono) {
      await this.toastService.error('Completa todos los campos requeridos');
      return;
    }

    if (
      nombre.length < 3 || nombre.length > 80 ||
      correo.length > 120 ||
      telefono.length < 7 || telefono.length > 15 ||
      numeroApartamento.length > 20 ||
      torre.length > 20
    ) {
      await this.toastService.error('Revisa la longitud de los campos');
      return;
    }

    if (!isValidEmail(correo) || !isValidPhone(telefono)) {
      await this.toastService.error('Revisa el formato del correo o del teléfono.');
      return;
    }

    // Las reglas de seguridad no permiten que un usuario cambie su propio
    // rol (solo otro administrador puede hacerlo desde Gestión de usuarios).
    // Sin este control, el intento fallaría en Firestore con un error
    // genérico que no explica la causa real.
    if (this.usuario.rol === 'admin' && this.rol !== this.usuario.rol) {
      await this.toastService.error('No puedes cambiar tu propio rol. Pídele a otro administrador que lo haga desde Gestión de usuarios.');
      return;
    }

    this.isSaving = true;

    const updatedUser: Usuario = {
      ...this.usuario,
      nombre,
      correo,
      telefono,
      numeroApartamento,
      ...(this.esComunidadDeCasas ? {} : { torre }),
      rol: this.usuario.rol === 'admin' ? this.rol : this.usuario.rol,
    };

    try {
      await firstValueFrom(this.firestoreService.addUsuario(updatedUser));
      this.authService.setCurrentUser(updatedUser);
      this.usuario = updatedUser;
      await this.toastService.success('Perfil actualizado');
    } catch (error) {
      console.error('Error guardando perfil:', error);
      await this.toastService.error('No se pudo guardar');
    } finally {
      this.isSaving = false;
    }
  }

  // Aparte de guardarPerfil(): el nombre de la vecindad vive en su propia
  // tarjeta ("Vecindad"), separada de "Datos personales" para que ambas
  // quepan una junto a la otra en escritorio — así necesita su propio botón
  // de guardar en vez de depender de uno en una tarjeta distinta.
  async guardarVecindad(): Promise<void> {
    if (this.isSavingVecindad || !this.comunidad?.idComunidad) {
      return;
    }

    const nombreComunidad = this.nombreComunidad.trim();

    if (!nombreComunidad) {
      await this.toastService.error('El nombre de la vecindad es requerido');
      return;
    }

    if (nombreComunidad.length > 60) {
      await this.toastService.error('No debe superar 60 caracteres');
      return;
    }

    this.isSavingVecindad = true;
    const idComunidad = this.comunidad.idComunidad;
    const codigoInvitacion = this.comunidad.codigoInvitacion;

    try {
      await firstValueFrom(this.firestoreService.updateComunidad(idComunidad, { nombreComunidad }));
      this.comunidad = { ...this.comunidad, nombreComunidad };

      // Backfill para comunidades creadas antes de que el cliente escribiera
      // codigos_invitacion (ver comentario en
      // FirestoreService.registrarCodigoInvitacion): re-escribirlo aquí
      // también arregla las comunidades existentes a las que les falta,
      // aprovechando que este botón ya está disponible para el admin.
      if (codigoInvitacion) {
        await firstValueFrom(this.firestoreService.registrarCodigoInvitacion(
          codigoInvitacion,
          idComunidad,
          nombreComunidad
        ));
      }

      await this.toastService.success('Vecindad actualizada');
    } catch (error) {
      console.error('Error guardando vecindad:', error);
      await this.toastService.error('No se pudo guardar');
    } finally {
      this.isSavingVecindad = false;
    }
  }

  establecerTema(preferencia: ThemePreference): void {
    if (preferencia === this.temaActual) {
      return;
    }

    this.temaActual = preferencia;
    this.themeService.setPreference(preferencia);
  }

  private async copiarTexto(texto: string, mensaje: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      await this.toastService.success(mensaje);
    } catch (error) {
      console.error('Error copiando texto:', error);
      await this.toastService.error('No se pudo copiar');
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

}
