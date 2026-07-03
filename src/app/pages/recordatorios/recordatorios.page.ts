import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonTextarea } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, timeOutline } from 'ionicons/icons';
import { Subject, distinctUntilChanged, filter, firstValueFrom, switchMap, takeUntil } from 'rxjs';
import { Recordatorio } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';

@Component({
  selector: 'app-recordatorios',
  templateUrl: './recordatorios.page.html',
  styleUrls: ['./recordatorios.page.scss'],
  standalone: true,
  imports: [IonButton, IonIcon, IonInput, IonItem, IonTextarea, IonContent, CommonModule, FormsModule],
})
export class RecordatoriosPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private readonly destroy$ = new Subject<void>();

  recordatorios: Recordatorio[] = [];
  tituloRecordatorio = '';
  descripcionRecordatorio = '';
  fechaRecordatorio = '';
  horaRecordatorio = '';
  idEditando: string | null = null;
  isLoading = false;
  recordatorioError = '';

  constructor() {
    addIcons({ calendarOutline, timeOutline });
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user?.idUsuario),
      distinctUntilChanged((previous, current) => previous?.idUsuario === current?.idUsuario),
      switchMap(user => this.firestoreService.getRecordatoriosByUsuario(user!.idUsuario || '')),
      takeUntil(this.destroy$)
    ).subscribe({
      next: data => {
        this.recordatorios = data;
        this.isLoading = false;
      },
      error: error => {
        console.error('Error cargando recordatorios:', error);
        this.isLoading = false;
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
      this.recordatorioError = 'Completa titulo, descripcion, fecha y hora.';
      return;
    }

    if (titulo.length < 3 || titulo.length > 80 || descripcion.length < 5 || descripcion.length > 300) {
      this.recordatorioError = 'Revisa la longitud del recordatorio.';
      return;
    }

    const fechaHora = `${this.fechaRecordatorio}T${this.horaRecordatorio}`;
    if (Number.isNaN(new Date(fechaHora).getTime())) {
      this.recordatorioError = 'Selecciona una fecha y hora validas.';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.idUsuario) {
      this.recordatorioError = 'No se pudo identificar el usuario actual.';
      return;
    }

    this.isLoading = true;
    const recordatorio: Omit<Recordatorio, 'idRecordatorios'> = {
      tituloRecordatorio: titulo,
      descripcionRecordatorio: descripcion,
      fechaHora,
      idUsuario: currentUser.idUsuario,
      comunidadId: currentUser.comunidadId,
      fechaCreacion: new Date().toISOString(),
    };

    try {
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
    const [fecha, hora = ''] = recordatorio.fechaHora.split('T');
    this.fechaRecordatorio = fecha;
    this.horaRecordatorio = hora.slice(0, 5);
    this.idEditando = recordatorio.idRecordatorios || null;
  }

  async eliminarRecordatorio(id: string | undefined): Promise<void> {
    if (!id) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.firestoreService.deleteRecordatorio(id));
    } catch (error) {
      console.error('Error eliminando recordatorio:', error);
      this.recordatorioError = 'No se pudo eliminar el recordatorio.';
    } finally {
      this.isLoading = false;
    }
  }

  trackByRecordatorioId(_: number, recordatorio: Recordatorio): string {
    return recordatorio.idRecordatorios || recordatorio.fechaHora || recordatorio.tituloRecordatorio;
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
