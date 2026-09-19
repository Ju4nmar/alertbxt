import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import {
  AlertController,
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/angular/standalone';
import { Subject, distinctUntilChanged, filter, firstValueFrom, switchMap, takeUntil } from 'rxjs';
import { Aviso } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ImageOptimizerService } from '../../services/image-optimizer.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { ToastService } from '../../services/toast.service';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ORIGINAL_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AVISO_TYPES = ['emergencia', 'mantenimiento', 'informativo'];

@Component({
  selector: 'app-gestion-avisos',
  templateUrl: './gestion-avisos.page.html',
  styleUrls: ['./gestion-avisos.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonInput,
    IonSelect,
    IonTextarea,
    IonItem,
    IonContent,
    IonSelectOption,
    CommonModule,
    FormsModule,
  ],
})
export class GestionAvisosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly storage = inject(Storage);
  private readonly authService = inject(AuthService);
  private readonly imageOptimizer = inject(ImageOptimizerService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private readonly alertController = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  avisos: Aviso[] = [];
  avisosAdministrativos: Aviso[] = [];
  alertasSos: Aviso[] = [];
  historialAlertasSos: Aviso[] = [];
  idEditando: string | null = null;
  titulo = '';
  tipo = '';
  descripcion = '';
  fechaAviso = this.todayDateString();
  ubicacion = '';
  archivo: File | null = null;
  compressionInfo = '';
  imagenExistente: string | null = null;
  isLoading = false;
  // Separado de isLoading (compartido con firestoreService.isLoading$ y con
  // "guardando el formulario"): reusarlo para el skeleton de la lista la
  // haría parpadear cada vez que se guarda o edita un aviso, no solo en la
  // carga inicial.
  isLoadingLista = true;
  avisoError = '';
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];
  private currentComunidadId = '';

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user?.comunidadId),
      distinctUntilChanged((previous, current) => previous?.comunidadId === current?.comunidadId),
      switchMap(user => {
        this.currentComunidadId = user!.comunidadId;
        return this.firestoreService.getAvisosByComunidad(user!.comunidadId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: data => {
        this.organizarAvisos(data);
        this.isLoadingLista = false;
      },
      error: error => {
        console.error('Error cargando avisos:', error);
        this.cargaError = 'No se pudieron cargar los avisos. Revisa tu conexión e intenta de nuevo.';
        this.isLoadingLista = false;
      },
    });

    this.firestoreService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  seleccionarArchivo(event: Event): void {
    this.avisoError = '';
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    if (!file) {
      this.archivo = null;
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.avisoError = 'Formato no permitido. Usa JPG, PNG o WebP.';
      input.value = '';
      this.archivo = null;
      return;
    }

    if (file.size > MAX_ORIGINAL_IMAGE_SIZE_BYTES) {
      this.avisoError = 'La imagen original no debe superar 10 MB.';
      input.value = '';
      this.archivo = null;
      return;
    }

    this.archivo = file;
    this.compressionInfo = 'La imagen se optimizara a WebP antes de subir.';
  }

  async guardarAviso(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.avisoError = '';
    const titulo = this.titulo.trim();
    const descripcion = this.descripcion.trim();
    const ubicacion = this.ubicacion.trim();

    if (!titulo || !this.tipo || !descripcion || !this.fechaAviso) {
      this.avisoError = 'Completa título, tipo, descripción y fecha.';
      return;
    }

    if (!ALLOWED_AVISO_TYPES.includes(this.tipo)) {
      this.avisoError = 'Selecciona un tipo de aviso válido.';
      return;
    }

    if (titulo.length < 3 || titulo.length > 80 || descripcion.length < 10 || descripcion.length > 500 || ubicacion.length > 120) {
      this.avisoError = 'Revisa la longitud del título, la descripción o la ubicación.';
      return;
    }

    const fechaSeleccionada = new Date(this.fechaAviso);
    if (Number.isNaN(fechaSeleccionada.getTime())) {
      this.avisoError = 'Selecciona una fecha válida.';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || currentUser.rol !== 'admin' || !this.currentComunidadId) {
      this.avisoError = 'No tienes permisos para guardar avisos.';
      return;
    }

    this.isLoading = true;
    try {
      let urlImagen = this.imagenExistente;

      if (this.archivo) {
        const optimized = await this.imageOptimizer.optimize(this.archivo, 0.75);
        if (optimized.optimizedSize > MAX_IMAGE_SIZE_BYTES) {
          this.avisoError = 'La imagen optimizada supera los 2 MB. Intenta con una imagen más pequeña.';
          return;
        }

        this.compressionInfo = `Optimizada de ${this.formatBytes(optimized.originalSize)} a ${this.formatBytes(optimized.optimizedSize)}.`;
        const safeName = optimized.file.name.replace(/[^\w.-]/g, '_');
        const ruta = `avisos/${this.currentComunidadId}/${Date.now()}_${safeName}`;
        const storageRef = ref(this.storage, ruta);
        await uploadBytes(storageRef, optimized.file, {
          contentType: optimized.file.type,
          customMetadata: {
            originalSize: String(optimized.originalSize),
            optimizedSize: String(optimized.optimizedSize),
            convertedToWebp: String(optimized.convertedToWebp),
          },
        });
        urlImagen = await getDownloadURL(storageRef);
      }

      // Conserva la hora actual sobre la fecha elegida, así los avisos del
      // mismo día siguen ordenándose por momento de guardado.
      const horaActual = new Date().toTimeString().slice(0, 8);
      const fechaPublicacion = new Date(`${this.fechaAviso}T${horaActual}`).toISOString();

      const avisoData: Omit<Aviso, 'idAviso'> = {
        tituloAviso: titulo,
        tipoAviso: this.tipo,
        descripcionAviso: descripcion,
        fechaPublicacion,
        autorId: currentUser.idUsuario || '',
        autorNombre: currentUser.nombre,
        comunidadId: this.currentComunidadId,
      };

      if (ubicacion) {
        avisoData.ubicacionAviso = ubicacion;
      }

      if (urlImagen) {
        avisoData.imagen = urlImagen;
      }

      const estabaEditando = !!this.idEditando;

      if (this.idEditando) {
        await firstValueFrom(this.firestoreService.updateAviso(this.idEditando, avisoData));
        this.idEditando = null;
      } else {
        await firstValueFrom(this.firestoreService.addAviso(avisoData));
        // Notificar nuevo aviso
        const tipoLabel = this.tipo === 'alerta' || this.tipo === 'emergencia' ? 'Nueva alerta' : 'Nuevo evento';
        this.localNotificationService.showNotification(tipoLabel, {
          body: titulo,
          tag: `aviso-new-${Date.now()}`,
        });
      }

      this.limpiarFormulario();
      await this.toastService.success(estabaEditando ? 'Aviso actualizado' : 'Aviso publicado');
    } catch (error) {
      console.error('Error guardando aviso:', error);
      this.avisoError = 'No se pudo guardar el aviso. Intenta nuevamente.';
    } finally {
      this.isLoading = false;
    }
  }

  limpiarFormulario(): void {
    this.idEditando = null;
    this.titulo = '';
    this.tipo = '';
    this.descripcion = '';
    this.fechaAviso = this.todayDateString();
    this.ubicacion = '';
    this.archivo = null;
    this.compressionInfo = '';
    this.imagenExistente = null;
    this.avisoError = '';
  }

  async eliminarAviso(id: string | undefined): Promise<void> {
    if (!id || this.authService.getCurrentUser()?.rol !== 'admin') {
      return;
    }

    const alerta = await this.alertController.create({
      header: 'Eliminar aviso',
      message: 'Esta acción no se puede deshacer. ¿Quieres eliminar este aviso?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.confirmarEliminarAviso(id) },
      ],
    });
    await alerta.present();
  }

  private async confirmarEliminarAviso(id: string): Promise<void> {
    try {
      await firstValueFrom(this.firestoreService.deleteAviso(id));
      await this.toastService.success('Aviso eliminado');
    } catch (error) {
      console.error('Error eliminando aviso:', error);
      this.avisoError = 'No se pudo eliminar el aviso.';
      await this.toastService.error('No se pudo eliminar el aviso.');
    }
  }

  editarAviso(aviso: Aviso): void {
    if (!ALLOWED_AVISO_TYPES.includes(aviso.tipoAviso)) {
      this.avisoError = 'Las alertas SOS son reportes de residentes y no se pueden editar.';
      return;
    }

    this.avisoError = '';
    this.idEditando = aviso.idAviso || null;
    this.titulo = aviso.tituloAviso;
    this.tipo = aviso.tipoAviso;
    this.descripcion = aviso.descripcionAviso;
    this.fechaAviso = aviso.fechaPublicacion ? aviso.fechaPublicacion.slice(0, 10) : this.todayDateString();
    this.ubicacion = aviso.ubicacionAviso || '';
    this.imagenExistente = aviso.imagen || null;
  }

  organizarAvisos(avisos: Aviso[]): void {
    this.avisos = avisos;
    this.avisosAdministrativos = avisos.filter(aviso => ALLOWED_AVISO_TYPES.includes(aviso.tipoAviso));

    // Una alerta validada sigue activa (el admin la está atendiendo): solo
    // sale de la lista activa cuando se rechaza, ya sea porque era inválida
    // o porque ya se atendió y se quiere cerrar. Ahí pasa al historial.
    const alertas = avisos.filter(aviso => aviso.tipoAviso === 'alerta');
    this.alertasSos = alertas
      .filter(alerta => alerta.estado !== 'rechazado')
      .sort((a, b) => (b.fechaPublicacion || '').localeCompare(a.fechaPublicacion || ''));
    this.historialAlertasSos = alertas
      .filter(alerta => alerta.estado === 'rechazado')
      .sort((a, b) => (b.fechaPublicacion || '').localeCompare(a.fechaPublicacion || ''));
  }

  async validarAlertaSos(alerta: Aviso): Promise<void> {
    await this.cambiarEstadoAlertaSos(alerta, 'validado');
  }

  async rechazarAlertaSos(alerta: Aviso): Promise<void> {
    await this.cambiarEstadoAlertaSos(alerta, 'rechazado');
  }

  private async cambiarEstadoAlertaSos(alerta: Aviso, estado: 'validado' | 'rechazado'): Promise<void> {
    if (alerta.tipoAviso !== 'alerta' || !alerta.idAviso || this.authService.getCurrentUser()?.rol !== 'admin') {
      return;
    }

    try {
      await firstValueFrom(this.firestoreService.updateAviso(alerta.idAviso, { estado }));
    } catch (error) {
      console.error('Error actualizando estado de la alerta SOS:', error);
      this.avisoError = 'No se pudo actualizar el estado de la alerta.';
      await this.toastService.error('No se pudo actualizar el estado de la alerta.');
    }
  }

  // Borrado físico, solo administrador (ya lo exige deleteAviso() vía la
  // regla de Firestore isAdminForCommunity): para reportes duplicados o
  // generados por error, donde no tiene sentido dejar registro en el
  // historial. "Rechazar" sigue siendo la forma normal de cerrar una alerta
  // atendida sin borrar su registro.
  async eliminarAlertaSos(alerta: Aviso): Promise<void> {
    if (!alerta.idAviso || this.authService.getCurrentUser()?.rol !== 'admin') {
      return;
    }

    const confirmacion = await this.alertController.create({
      header: 'Eliminar alerta SOS',
      message: 'Esta acción no se puede deshacer. ¿Quieres eliminar permanentemente esta alerta?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.confirmarEliminarAlertaSos(alerta.idAviso as string) },
      ],
    });
    await confirmacion.present();
  }

  private async confirmarEliminarAlertaSos(id: string): Promise<void> {
    try {
      await firstValueFrom(this.firestoreService.deleteAviso(id));
      await this.toastService.success('Alerta SOS eliminada');
    } catch (error) {
      console.error('Error eliminando alerta SOS:', error);
      await this.toastService.error('No se pudo eliminar la alerta.');
    }
  }

  trackByAvisoId(_: number, aviso: Aviso): string {
    return aviso.idAviso || aviso.fechaPublicacion || aviso.tituloAviso;
  }

  private todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}
