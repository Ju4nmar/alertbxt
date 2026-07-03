import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import {
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
  private readonly destroy$ = new Subject<void>();

  avisos: Aviso[] = [];
  idEditando: string | null = null;
  titulo = '';
  tipo = '';
  descripcion = '';
  archivo: File | null = null;
  compressionInfo = '';
  imagenExistente: string | null = null;
  isLoading = false;
  avisoError = '';
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
        this.avisos = data;
      },
      error: error => {
        console.error('Error cargando avisos:', error);
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

    if (!titulo || !this.tipo || !descripcion) {
      this.avisoError = 'Completa titulo, tipo y descripcion.';
      return;
    }

    if (!ALLOWED_AVISO_TYPES.includes(this.tipo)) {
      this.avisoError = 'Selecciona un tipo de aviso valido.';
      return;
    }

    if (titulo.length < 3 || titulo.length > 80 || descripcion.length < 10 || descripcion.length > 500) {
      this.avisoError = 'Revisa la longitud del titulo o la descripcion.';
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
          this.avisoError = 'La imagen optimizada supera 2 MB. Intenta con una imagen mas pequena.';
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

      const avisoData: Omit<Aviso, 'idAviso'> = {
        tituloAviso: titulo,
        tipoAviso: this.tipo,
        descripcionAviso: descripcion,
        fechaPublicacion: new Date().toISOString(),
        imagen: urlImagen || undefined,
        autorId: currentUser.idUsuario || '',
        autorNombre: currentUser.nombre,
        comunidadId: this.currentComunidadId,
      };

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
    this.archivo = null;
    this.compressionInfo = '';
    this.imagenExistente = null;
    this.avisoError = '';
  }

  async eliminarAviso(id: string | undefined): Promise<void> {
    if (!id || this.authService.getCurrentUser()?.rol !== 'admin') {
      return;
    }

    try {
      await firstValueFrom(this.firestoreService.deleteAviso(id));
    } catch (error) {
      console.error('Error eliminando aviso:', error);
      this.avisoError = 'No se pudo eliminar el aviso.';
    }
  }

  editarAviso(aviso: Aviso): void {
    this.avisoError = '';
    this.idEditando = aviso.idAviso || null;
    this.titulo = aviso.tituloAviso;
    this.tipo = aviso.tipoAviso;
    this.descripcion = aviso.descripcionAviso;
    this.imagenExistente = aviso.imagen || null;
  }

  trackByAvisoId(_: number, aviso: Aviso): string {
    return aviso.idAviso || aviso.fechaPublicacion || aviso.tituloAviso;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}
