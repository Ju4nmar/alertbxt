import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonInput, IonItem, IonTextarea } from '@ionic/angular/standalone';
import { Subject, distinctUntilChanged, filter, firstValueFrom, switchMap, takeUntil } from 'rxjs';
import { Notificacion, Usuario } from '../../models';
import { TiempoRelativoPipe } from '../../pipes/tiempo-relativo.pipe';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { ToastService } from '../../services/toast.service';

type ModoAsignacion = 'yo' | 'elegir' | 'todos';

@Component({
  selector: 'app-notificaciones',
  templateUrl: './notificaciones.page.html',
  styleUrls: ['./notificaciones.page.scss'],
  standalone: true,
  imports: [IonButton, IonInput, IonItem, IonTextarea, IonContent, CommonModule, FormsModule, TiempoRelativoPipe],
})
export class NotificacionesPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private readonly alertController = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  usuario: Usuario | null = null;
  notificaciones: Notificacion[] = [];
  tituloNotificacion = '';
  descripcionNotificacion = '';
  fechaNotificacion = '';
  horaNotificacion = '';
  idEditando: string | null = null;
  // true cuando se edita una notificación asignada por un admin (en vez de
  // uno personal): el guardado no debe tocar usuariosAsignados/
  // paraTodaLaComunidad, solo el contenido y la fecha/hora.
  editandoAsignado = false;
  isLoading = false;
  // Separado de isLoading (que también cubre "guardando el formulario"):
  // reusarlo para el skeleton de la lista la haría parpadear cada vez que
  // se guarda una notificación, no solo en la carga inicial.
  isLoadingLista = true;
  notificacionError = '';
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  // Solo relevante para administradores: a quién se asigna la notificación
  // que se está creando. Los residentes siempre crean para sí mismos, sin
  // este selector.
  modoAsignacion: ModoAsignacion = 'yo';
  comunidadUsuarios: Usuario[] = [];
  private readonly idsAsignados = new Set<string>();

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  filtroVecino = '';

  get vecinosFiltrados(): Usuario[] {
    const texto = this.filtroVecino.trim().toLowerCase();
    if (!texto) {
      return this.comunidadUsuarios;
    }
    return this.comunidadUsuarios.filter(vecino =>
      `${vecino.nombre || ''} ${vecino.torre || ''} ${vecino.numeroApartamento || ''}`.toLowerCase().includes(texto)
    );
  }

  seleccionarVisibles(): void {
    this.vecinosFiltrados.forEach(vecino => vecino.idUsuario && this.idsAsignados.add(vecino.idUsuario));
  }

  limpiarSeleccion(): void {
    this.idsAsignados.clear();
  }

  get cantidadAsignados(): number {
    return this.idsAsignados.size;
  }

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.idUsuario),
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        this.usuario = user;
      });

    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.idUsuario && !!user?.comunidadId),
        distinctUntilChanged((previous, current) =>
          previous?.idUsuario === current?.idUsuario && previous?.comunidadId === current?.comunidadId
        ),
        switchMap(user => this.firestoreService.getNotificacionesVisibles(user!)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: notificaciones => {
          this.notificaciones = notificaciones;
          this.isLoading = false;
          this.isLoadingLista = false;
        },
        error: error => {
          console.error('Error cargando notificaciones:', error);
          this.isLoading = false;
          this.isLoadingLista = false;
          this.cargaError = 'No se pudieron cargar las notificaciones. Revisa tu conexión e intenta de nuevo.';
        },
      });

    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.comunidadId && user?.rol === 'admin'),
        distinctUntilChanged((previous, current) => previous?.comunidadId === current?.comunidadId),
        switchMap(user => this.firestoreService.getUsuariosByComunidad(user!.comunidadId)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: usuarios => {
          this.comunidadUsuarios = usuarios
            .filter(u => u.idUsuario && u.idUsuario !== this.usuario?.idUsuario)
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        },
        error: error => console.error('Error cargando vecinos de la comunidad:', error),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  esPersonal(notificacion: Notificacion): boolean {
    return !!notificacion.idUsuario && notificacion.idUsuario === this.usuario?.idUsuario;
  }

  esCreador(notificacion: Notificacion): boolean {
    return !notificacion.idUsuario && !!notificacion.autorId && notificacion.autorId === this.usuario?.idUsuario;
  }

  origenNotificacion(notificacion: Notificacion): string | null {
    if (notificacion.idUsuario) {
      return null;
    }
    if (this.esCreador(notificacion)) {
      const cantidad = notificacion.usuariosAsignados?.length || 0;
      return notificacion.paraTodaLaComunidad
        ? 'Asignado por ti a toda la comunidad'
        : `Asignado por ti a ${cantidad} ${cantidad === 1 ? 'vecino' : 'vecinos'}`;
    }
    return notificacion.paraTodaLaComunidad ? 'Para toda la comunidad' : 'Asignado por el administrador';
  }

  elegirModoAsignacion(modo: ModoAsignacion): void {
    this.modoAsignacion = modo;
    this.notificacionError = '';
  }

  estaAsignado(usuario: Usuario): boolean {
    return !!usuario.idUsuario && this.idsAsignados.has(usuario.idUsuario);
  }

  alternarAsignado(usuario: Usuario): void {
    if (!usuario.idUsuario) {
      return;
    }

    if (this.idsAsignados.has(usuario.idUsuario)) {
      this.idsAsignados.delete(usuario.idUsuario);
    } else {
      this.idsAsignados.add(usuario.idUsuario);
    }
  }

  async guardarNotificacion(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.notificacionError = '';
    const titulo = this.tituloNotificacion.trim();
    const descripcion = this.descripcionNotificacion.trim();

    if (!titulo || !descripcion || !this.fechaNotificacion || !this.horaNotificacion) {
      this.notificacionError = 'Completa título, descripción, fecha y hora.';
      return;
    }

    if (titulo.length < 3 || titulo.length > 80 || descripcion.length < 5 || descripcion.length > 300) {
      this.notificacionError = 'Revisa la longitud de la notificación.';
      return;
    }

    const fechaHoraLocal = new Date(`${this.fechaNotificacion}T${this.horaNotificacion}`);
    if (Number.isNaN(fechaHoraLocal.getTime())) {
      this.notificacionError = 'Selecciona una fecha y hora válidas.';
      return;
    }

    if (fechaHoraLocal.getTime() < Date.now()) {
      this.notificacionError = 'La fecha y hora de la notificación deben ser futuras.';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.idUsuario) {
      this.notificacionError = 'No se pudo identificar el usuario actual.';
      return;
    }

    if (!currentUser.comunidadId) {
      this.notificacionError = 'Únete a una vecindad antes de crear notificaciones.';
      return;
    }

    const asignandoAOtros = this.esAdmin && !this.idEditando && this.modoAsignacion !== 'yo';

    if (asignandoAOtros && this.modoAsignacion === 'elegir' && !this.idsAsignados.size) {
      this.notificacionError = 'Selecciona al menos un vecino, o elige "Todos".';
      return;
    }

    this.isLoading = true;
    try {
      if (asignandoAOtros) {
        await firstValueFrom(this.firestoreService.crearNotificacionAsignada({
          titulo,
          descripcion,
          fechaHora: fechaHoraLocal.toISOString(),
          usuarioIds: this.modoAsignacion === 'elegir' ? Array.from(this.idsAsignados) : undefined,
          paraTodos: this.modoAsignacion === 'todos',
        }));
        this.resetForm();
        await this.toastService.success('Notificación asignada');
        return;
      }

      const estabaEditando = !!this.idEditando;

      if (this.idEditando && this.editandoAsignado) {
        // Notificación asignada por un admin: solo se actualiza el
        // contenido, nunca a quién está asignado.
        await firstValueFrom(this.firestoreService.updateNotificacion(this.idEditando, {
          tituloNotificacion: titulo,
          descripcionNotificacion: descripcion,
          fechaHora: fechaHoraLocal.toISOString(),
        }));
        this.idEditando = null;
      } else if (this.idEditando) {
        await firstValueFrom(this.firestoreService.updateNotificacion(this.idEditando, {
          tituloNotificacion: titulo,
          descripcionNotificacion: descripcion,
          fechaHora: fechaHoraLocal.toISOString(),
          idUsuario: currentUser.idUsuario,
          comunidadId: currentUser.comunidadId,
        }));
        this.idEditando = null;
      } else {
        const notificacion: Omit<Notificacion, 'idNotificaciones'> = {
          tituloNotificacion: titulo,
          descripcionNotificacion: descripcion,
          fechaHora: fechaHoraLocal.toISOString(),
          idUsuario: currentUser.idUsuario,
          comunidadId: currentUser.comunidadId,
          fechaCreacion: new Date().toISOString(),
        };

        await firstValueFrom(this.firestoreService.addNotificacion(notificacion));
        // Notificar nueva notificación creada
        this.localNotificationService.showNotification('Notificación creada', {
          body: titulo,
          tag: `notificacion-new-${Date.now()}`,
        });
      }
      this.resetForm();
      await this.toastService.success(estabaEditando ? 'Notificación actualizada' : 'Notificación creada');
    } catch (error) {
      console.error('Error guardando notificacion:', error);
      this.notificacionError = error instanceof Error ? error.message : 'No se pudo guardar la notificación.';
    } finally {
      this.isLoading = false;
    }
  }

  editarNotificacion(notificacion: Notificacion): void {
    const esAsignado = this.esCreador(notificacion);
    if (!this.esPersonal(notificacion) && !esAsignado) {
      return;
    }

    this.notificacionError = '';
    this.tituloNotificacion = notificacion.tituloNotificacion;
    this.descripcionNotificacion = notificacion.descripcionNotificacion;
    const fechaHora = new Date(notificacion.fechaHora);
    this.fechaNotificacion = this.toLocalDateInputValue(fechaHora);
    this.horaNotificacion = this.toLocalTimeInputValue(fechaHora);
    this.idEditando = notificacion.idNotificaciones || null;
    this.editandoAsignado = esAsignado;
  }

  async eliminarNotificacion(notificacion: Notificacion): Promise<void> {
    if (!notificacion.idNotificaciones || !(this.esPersonal(notificacion) || this.esCreador(notificacion))) {
      return;
    }

    const id = notificacion.idNotificaciones;
    const alerta = await this.alertController.create({
      header: 'Eliminar notificación',
      message: 'Esta acción no se puede deshacer. ¿Quieres eliminar esta notificación?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.confirmarEliminarNotificacion(id) },
      ],
    });
    await alerta.present();
  }

  private async confirmarEliminarNotificacion(id: string): Promise<void> {
    this.isLoading = true;
    try {
      await firstValueFrom(this.firestoreService.deleteNotificacion(id));
      await this.toastService.success('Notificación eliminada');
    } catch (error) {
      console.error('Error eliminando notificacion:', error);
      this.notificacionError = 'No se pudo eliminar la notificación.';
      await this.toastService.error('No se pudo eliminar la notificación.');
    } finally {
      this.isLoading = false;
    }
  }

  trackByNotificacionId(_: number, notificacion: Notificacion): string {
    return notificacion.idNotificaciones || notificacion.fechaHora || notificacion.tituloNotificacion;
  }

  esFuturo(fecha: string | undefined): boolean {
    return !!fecha && new Date(fecha).getTime() > Date.now();
  }

  private toLocalDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toLocalTimeInputValue(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private resetForm(): void {
    this.idEditando = null;
    this.editandoAsignado = false;
    this.tituloNotificacion = '';
    this.descripcionNotificacion = '';
    this.fechaNotificacion = '';
    this.horaNotificacion = '';
    this.notificacionError = '';
    this.modoAsignacion = 'yo';
    this.idsAsignados.clear();
    this.filtroVecino = '';
  }
}
