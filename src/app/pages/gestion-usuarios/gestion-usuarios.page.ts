import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  AlertController,
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
import { Subject, distinctUntilChanged, filter, finalize, switchMap, take, takeUntil } from 'rxjs';
import { Comunidad, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { MensajesService } from '../../services/mensajes.service';
import { ToastService } from '../../services/toast.service';

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
    FormsModule,
  ],
})
export class GestionUsuariosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly alertController = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly mensajesService = inject(MensajesService);
  private readonly destroy$ = new Subject<void>();

  usuarios: Usuario[] = [];
  usuarioSeleccionado: Usuario | null = null;
  comunidad: Comunidad | null = null;
  isLoading = false;
  modalAbierto = false;
  actualizandoUsuario = false;
  enviandoMensaje = false;
  cargaError = '';
  filtroTexto = '';

  get esComunidadDeCasas(): boolean {
    return this.comunidad?.tipoComunidad === 'casas';
  }

  get usuariosFiltrados(): Usuario[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    if (!texto) {
      return this.usuarios;
    }

    return this.usuarios.filter(usuario => {
      const unidad = this.formatearUnidad(usuario).toLowerCase();
      return (usuario.nombre || '').toLowerCase().includes(texto)
        || (usuario.numeroApartamento || '').toLowerCase().includes(texto)
        || (usuario.torre || '').toLowerCase().includes(texto)
        || unidad.includes(texto);
    });
  }

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
          this.cargaError = 'No se pudieron cargar los usuarios. Revisa tu conexión e intenta de nuevo.';
        },
      });

    // Determina si mostrar "Torre y Apartamento" o "Número de casa" al
    // listar vecinos (ver Comunidad.tipoComunidad).
    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.comunidadId && user?.rol === 'admin'),
        distinctUntilChanged((previous, current) => previous?.comunidadId === current?.comunidadId),
        switchMap(user => this.firestoreService.getComunidadById(user!.comunidadId)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: comunidad => this.comunidad = comunidad,
        error: error => console.error('Error cargando la comunidad:', error),
      });
  }

  formatearUnidad(usuario: Usuario): string {
    if (!usuario.numeroApartamento) {
      return '';
    }

    if (this.esComunidadDeCasas) {
      return `Casa ${usuario.numeroApartamento}`;
    }

    return usuario.torre ? `Torre ${usuario.torre} - Apto ${usuario.numeroApartamento}` : `Apartamento ${usuario.numeroApartamento}`;
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

  async alternarEstado(usuario: Usuario): Promise<void> {
    if (!this.puedeGestionarUsuario(usuario)) {
      return;
    }

    const activo = usuario.activo !== false;
    if (activo) {
      const alerta = await this.alertController.create({
        header: 'Desactivar residente',
        message: `¿Deseas desactivar a ${usuario.nombre}? No podrá acceder a los avisos ni recordatorios de la comunidad.`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Desactivar', role: 'destructive', handler: () => this.actualizarUsuario(usuario, { activo: false }) },
        ],
      });
      await alerta.present();
      return;
    }

    this.actualizarUsuario(usuario, { activo: true });
  }

  cambiarRol(usuario: Usuario): void {
    if (this.puedeGestionarUsuario(usuario)) {
      this.actualizarUsuario(usuario, { rol: usuario.rol === 'admin' ? 'residente' : 'admin' });
    }
  }

  puedeGestionarUsuario(usuario: Usuario): boolean {
    const usuarioActual = this.authService.getCurrentUser();
    return usuarioActual?.rol === 'admin'
      && usuarioActual.comunidadId === usuario.comunidadId
      && usuarioActual.idUsuario !== usuario.idUsuario;
  }

  async enviarMensaje(usuario: Usuario): Promise<void> {
    if (!this.puedeGestionarUsuario(usuario) || !usuario.idUsuario || this.enviandoMensaje) {
      return;
    }

    const alerta = await this.alertController.create({
      header: `Mensaje para ${usuario.nombre}`,
      inputs: [
        {
          name: 'mensaje',
          type: 'textarea',
          placeholder: 'Escribe tu mensaje...',
          attributes: { maxlength: 500 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Enviar', handler: data => this.confirmarEnviarMensaje(usuario, (data?.mensaje || '').trim()) },
      ],
    });
    await alerta.present();
  }

  private confirmarEnviarMensaje(usuario: Usuario, mensaje: string): boolean {
    if (!mensaje || !usuario.idUsuario) {
      this.toastService.error('Escribe un mensaje antes de enviarlo.');
      return false;
    }

    this.enviandoMensaje = true;
    this.mensajesService.enviarMensajeIndividual(usuario.idUsuario, mensaje)
      .pipe(take(1), finalize(() => this.enviandoMensaje = false), takeUntil(this.destroy$))
      .subscribe({
        next: () => this.toastService.success(`Mensaje enviado a ${usuario.nombre}`),
        error: error => {
          console.error('Error enviando mensaje individual:', error);
          this.toastService.error(error?.message || 'No se pudo enviar el mensaje.');
        },
      });

    return true;
  }

  private actualizarUsuario(usuario: Usuario, cambios: Partial<Pick<Usuario, 'activo' | 'rol'>>): void {
    if (!usuario.idUsuario) {
      return;
    }

    this.actualizandoUsuario = true;
    this.firestoreService.updateUsuarioEstado(usuario.idUsuario, cambios)
      .pipe(take(1), finalize(() => this.actualizandoUsuario = false), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.usuarioSeleccionado = { ...usuario, ...cambios };
          this.toastService.success('Usuario actualizado');
        },
        error: error => {
          console.error('Error actualizando usuario:', error);
          this.toastService.error('No se pudo actualizar el usuario.');
        },
      });
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
