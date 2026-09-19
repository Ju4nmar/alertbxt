import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonInput, IonItem, IonTextarea } from '@ionic/angular/standalone';
import { Subject, distinctUntilChanged, filter, firstValueFrom, switchMap, takeUntil } from 'rxjs';
import { Recordatorio } from '../../models';
import { TiempoRelativoPipe } from '../../pipes/tiempo-relativo.pipe';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-recordatorios',
  templateUrl: './recordatorios.page.html',
  styleUrls: ['./recordatorios.page.scss'],
  standalone: true,
  imports: [IonButton, IonInput, IonItem, IonTextarea, IonContent, CommonModule, FormsModule, TiempoRelativoPipe],
})
export class RecordatoriosPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private readonly alertController = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  recordatorios: Recordatorio[] = [];
  tituloRecordatorio = '';
  descripcionRecordatorio = '';
  fechaRecordatorio = '';
  horaRecordatorio = '';
  idEditando: string | null = null;
  isLoading = false;
  // Separado de isLoading (que también cubre "guardando el formulario"):
  // reusarlo para el skeleton de la lista la haría parpadear cada vez que
  // se guarda un recordatorio, no solo en la carga inicial.
  isLoadingLista = true;
  recordatorioError = '';
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user?.idUsuario && !!user?.comunidadId),
      distinctUntilChanged((previous, current) =>
        previous?.idUsuario === current?.idUsuario && previous?.comunidadId === current?.comunidadId
      ),
      switchMap(user => this.firestoreService.getRecordatoriosByUsuario(user!.idUsuario || '', user!.comunidadId)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: data => {
        this.recordatorios = data;
        this.isLoading = false;
        this.isLoadingLista = false;
      },
      error: error => {
        console.error('Error cargando recordatorios:', error);
        this.isLoading = false;
        this.isLoadingLista = false;
        this.cargaError = 'No se pudieron cargar los recordatorios. Revisa tu conexión e intenta de nuevo.';
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async guardarRecordatorio(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.recordatorioError = '';
    const titulo = this.tituloRecordatorio.trim();
    const descripcion = this.descripcionRecordatorio.trim();

    if (!titulo || !descripcion || !this.fechaRecordatorio || !this.horaRecordatorio) {
      this.recordatorioError = 'Completa título, descripción, fecha y hora.';
      return;
    }

    if (titulo.length < 3 || titulo.length > 80 || descripcion.length < 5 || descripcion.length > 300) {
      this.recordatorioError = 'Revisa la longitud del recordatorio.';
      return;
    }

    const fechaHoraLocal = new Date(`${this.fechaRecordatorio}T${this.horaRecordatorio}`);
    if (Number.isNaN(fechaHoraLocal.getTime())) {
      this.recordatorioError = 'Selecciona una fecha y hora válidas.';
      return;
    }

    if (fechaHoraLocal.getTime() < Date.now()) {
      this.recordatorioError = 'La fecha y hora del recordatorio deben ser futuras.';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.idUsuario) {
      this.recordatorioError = 'No se pudo identificar el usuario actual.';
      return;
    }

    if (!currentUser.comunidadId) {
      this.recordatorioError = 'Únete a una vecindad antes de crear recordatorios.';
      return;
    }

    this.isLoading = true;
    const recordatorio: Omit<Recordatorio, 'idRecordatorios'> = {
      tituloRecordatorio: titulo,
      descripcionRecordatorio: descripcion,
      fechaHora: fechaHoraLocal.toISOString(),
      idUsuario: currentUser.idUsuario,
      comunidadId: currentUser.comunidadId,
      fechaCreacion: new Date().toISOString(),
    };

    try {
      const estabaEditando = !!this.idEditando;

      if (this.idEditando) {
        await firstValueFrom(this.firestoreService.updateRecordatorio(this.idEditando, recordatorio));
        this.idEditando = null;
      } else {
        await firstValueFrom(this.firestoreService.addRecordatorio(recordatorio));
        // Notificar nuevo recordatorio creado
        this.localNotificationService.showNotification('Recordatorio creado', {
          body: titulo,
          tag: `recordatorio-new-${Date.now()}`,
        });
      }
      this.resetForm();
      await this.toastService.success(estabaEditando ? 'Recordatorio actualizado' : 'Recordatorio creado');
    } catch (error) {
      console.error('Error guardando recordatorio:', error);
      this.recordatorioError = 'No se pudo guardar el recordatorio.';
    } finally {
      this.isLoading = false;
    }
  }

  editarRecordatorio(recordatorio: Recordatorio): void {
    this.recordatorioError = '';
    this.tituloRecordatorio = recordatorio.tituloRecordatorio;
    this.descripcionRecordatorio = recordatorio.descripcionRecordatorio;
    const fechaHora = new Date(recordatorio.fechaHora);
    this.fechaRecordatorio = this.toLocalDateInputValue(fechaHora);
    this.horaRecordatorio = this.toLocalTimeInputValue(fechaHora);
    this.idEditando = recordatorio.idRecordatorios || null;
  }

  async eliminarRecordatorio(id: string | undefined): Promise<void> {
    if (!id) {
      return;
    }

    const alerta = await this.alertController.create({
      header: 'Eliminar recordatorio',
      message: 'Esta acción no se puede deshacer. ¿Quieres eliminar este recordatorio?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.confirmarEliminarRecordatorio(id) },
      ],
    });
    await alerta.present();
  }

  private async confirmarEliminarRecordatorio(id: string): Promise<void> {
    this.isLoading = true;
    try {
      await firstValueFrom(this.firestoreService.deleteRecordatorio(id));
      await this.toastService.success('Recordatorio eliminado');
    } catch (error) {
      console.error('Error eliminando recordatorio:', error);
      this.recordatorioError = 'No se pudo eliminar el recordatorio.';
      await this.toastService.error('No se pudo eliminar el recordatorio.');
    } finally {
      this.isLoading = false;
    }
  }

  trackByRecordatorioId(_: number, recordatorio: Recordatorio): string {
    return recordatorio.idRecordatorios || recordatorio.fechaHora || recordatorio.tituloRecordatorio;
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
    this.tituloRecordatorio = '';
    this.descripcionRecordatorio = '';
    this.fechaRecordatorio = '';
    this.horaRecordatorio = '';
    this.recordatorioError = '';
  }
}
