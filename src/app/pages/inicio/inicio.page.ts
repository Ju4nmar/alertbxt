import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  carOutline,
  chatbubbleEllipsesOutline,
  megaphoneOutline,
  pencilOutline,
} from 'ionicons/icons';
import { Subject, catchError, combineLatest, distinctUntilChanged, filter, firstValueFrom, of, switchMap, takeUntil } from 'rxjs';
import { Aviso, Comunidad, Notificacion, Usuario } from '../../models';
import { TiempoRelativoPipe } from '../../pipes/tiempo-relativo.pipe';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { DIAS_PICO_PLACA, PicoPlacaHoy, picoPlacaDeHoy, valorPicoPlaca } from '../../utils/pico-placa.utils';

const VENTANA_ALERTA_ACTIVA_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonIcon, TiempoRelativoPipe],
})
export class InicioPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  constructor() {
    addIcons({ alertCircleOutline, calendarOutline, carOutline, chatbubbleEllipsesOutline, megaphoneOutline, pencilOutline });
  }

  readonly diasPicoPlaca = DIAS_PICO_PLACA;
  usuario: Usuario | null = null;
  comunidad: Comunidad | null = null;
  isLoading = true;
  cargaError = '';
  alertasActivas = 0;
  noticias: Aviso[] = [];
  proximas: Notificacion[] = [];
  picoPlaca: PicoPlacaHoy = { etiquetaDia: '', restriccion: null, finDeSemana: false, festivo: null, horario: null };
  editandoPicoPlaca = false;
  guardandoPicoPlaca = false;
  borradorPicoPlaca: Record<string, string> = {};
  readonly hoy = new Date();

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId && !!user?.idUsuario),
      distinctUntilChanged((previous, current) =>
        previous.comunidadId === current.comunidadId && previous.idUsuario === current.idUsuario
      ),
      switchMap(user => {
        this.usuario = user;
        return combineLatest([
          this.firestoreService.getAvisosByComunidad(user.comunidadId, user.rol).pipe(catchError(error => this.fallo('avisos', error, [] as Aviso[]))),
          this.firestoreService.getNotificacionesVisibles(user).pipe(catchError(error => this.fallo('notificaciones', error, [] as Notificacion[]))),
          this.firestoreService.getComunidadById(user.comunidadId).pipe(catchError(error => this.fallo('comunidad', error, null as Comunidad | null))),
        ]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(([avisos, notificaciones, comunidad]) => {
      this.comunidad = comunidad;
      this.picoPlaca = picoPlacaDeHoy(comunidad?.picoPlaca, this.hoy);
      this.calcularResumen(avisos, notificaciones);
      this.isLoading = false;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get saludo(): string {
    const hora = this.hoy.getHours();
    const momento = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const primerNombre = (this.usuario?.nombre || '').trim().split(/\s+/)[0];
    return primerNombre ? `${momento}, ${primerNombre}` : momento;
  }

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  irA(ruta: string): void {
    void this.router.navigate([ruta]);
  }

  editarPicoPlaca(): void {
    this.borradorPicoPlaca = {};
    for (const dia of DIAS_PICO_PLACA) {
      this.borradorPicoPlaca[dia.clave] = valorPicoPlaca(this.comunidad?.picoPlaca, dia.clave, this.hoy);
    }
    this.editandoPicoPlaca = true;
  }

  cancelarPicoPlaca(): void {
    this.editandoPicoPlaca = false;
  }

  async guardarPicoPlaca(): Promise<void> {
    if (!this.comunidad?.idComunidad || this.guardandoPicoPlaca) {
      return;
    }
    const picoPlaca: Record<string, string> = {};
    for (const dia of DIAS_PICO_PLACA) {
      picoPlaca[dia.clave] = (this.borradorPicoPlaca[dia.clave] ?? '').trim().slice(0, 30);
    }

    this.guardandoPicoPlaca = true;
    try {
      await firstValueFrom(this.firestoreService.updateComunidad(this.comunidad.idComunidad, { picoPlaca }));
      this.comunidad = { ...this.comunidad, picoPlaca };
      this.picoPlaca = picoPlacaDeHoy(picoPlaca, this.hoy);
      this.editandoPicoPlaca = false;
      await this.avisar('Pico y placa actualizado.');
    } catch (error) {
      console.error('Error guardando pico y placa:', error);
      await this.avisar('No se pudo guardar. Intenta de nuevo.');
    } finally {
      this.guardandoPicoPlaca = false;
      this.cdr.markForCheck();
    }
  }

  trackById(_: number, item: { idAviso?: string; idNotificaciones?: string }): string {
    return item.idAviso || item.idNotificaciones || '';
  }

  private calcularResumen(avisos: Aviso[], notificaciones: Notificacion[]): void {
    const ahora = Date.now();

    this.alertasActivas = avisos.filter(aviso =>
      (aviso.tipoAviso === 'alerta' || aviso.tipoAviso === 'emergencia')
      && aviso.estado !== 'rechazado'
      && ahora - new Date(aviso.fechaPublicacion || 0).getTime() < VENTANA_ALERTA_ACTIVA_MS
    ).length;

    this.noticias = avisos
      .filter(aviso => aviso.tipoAviso !== 'alerta' && aviso.tipoAviso !== 'emergencia')
      .sort((a, b) => (b.fechaPublicacion || '').localeCompare(a.fechaPublicacion || ''))
      .slice(0, 3);

    this.proximas = notificaciones
      .filter(notificacion => notificacion.estado !== 'completado' && new Date(notificacion.fechaHora).getTime() >= ahora)
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
      .slice(0, 3);
  }

  private fallo<T>(origen: string, error: unknown, valor: T) {
    console.error(`Error cargando ${origen} del inicio:`, error);
    this.cargaError = 'Parte de la información no se pudo cargar. Revisa tu conexión.';
    return of(valor);
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
