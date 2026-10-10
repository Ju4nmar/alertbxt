import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  checkmarkCircle,
  locationOutline,
  navigateOutline,
  notificationsOffOutline,
  personCircleOutline,
  personOutline,
  timeOutline,
} from 'ionicons/icons';
import { Subject, catchError, combineLatest, distinctUntilChanged, filter, forkJoin, interval, map, of, switchMap, takeUntil } from 'rxjs';
import { Aviso, Notificacion } from '../../models';
import { TiempoRelativoPipe } from '../../pipes/tiempo-relativo.pipe';
import { enlaceMapa } from '../../utils/ubicacion.utils';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

interface PanelCard {
  tipo: 'aviso' | 'notificacion';
  id: string;
  fecha: string;
  aviso?: Aviso;
  notificacion?: Notificacion;
}

interface ModalData {
  variant: 'aviso' | 'notificacion';
  titulo: string;
  descripcion: string;
  fecha?: string;
  ubicacion?: string;
  enlaceMapa?: string;
  precisionMetros?: number;
  tipo?: string;
  autor?: string;
  imagen?: string;
}

type FiltroPanel = 'todos' | 'aviso' | 'notificacion';

@Component({
  selector: 'app-alertas-eventos',
  templateUrl: './alertas-eventos.page.html',
  styleUrls: ['./alertas-eventos.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonIcon, TiempoRelativoPipe],
})
export class AlertasEventosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  constructor() {
    addIcons({
      alertCircleOutline,
      calendarOutline,
      checkmarkCircle,
      locationOutline,
      navigateOutline,
      notificationsOffOutline,
      personCircleOutline,
      personOutline,
      timeOutline,
    });
  }

  avisos: Aviso[] = [];
  notificaciones: Notificacion[] = [];
  tarjetas: PanelCard[] = [];
  tarjetasVisibles: PanelCard[] = [];
  filtro: FiltroPanel = 'todos';
  modalAbierto = false;
  modalData: ModalData | null = null;
  isLoading = false;
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3, 4, 5, 6];

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user?.comunidadId && !!user?.idUsuario),
      distinctUntilChanged((previous, current) =>
        previous?.comunidadId === current?.comunidadId && previous?.idUsuario === current?.idUsuario
      ),
      switchMap(user => combineLatest([
        this.firestoreService.getAvisosByComunidad(user!.comunidadId, user!.rol).pipe(
          switchMap(avisos => this.completarAutores(avisos)),
          catchError(error => {
            console.error('Error cargando avisos:', error);
            this.cargaError = 'No se pudieron cargar los avisos. Revisa tu conexión e intenta de nuevo.';
            return of([]);
          })
        ),
        this.firestoreService.getNotificacionesVisibles(user!).pipe(
          catchError(error => {
            console.error('Error cargando notificaciones:', error);
            this.cargaError = 'No se pudieron cargar las notificaciones. Revisa tu conexión e intenta de nuevo.';
            return of([]);
          })
        ),
      ])),
      takeUntil(this.destroy$)
    ).subscribe({
      next: ([avisos, notificaciones]) => {
        // Una alerta SOS rechazada por un administrador (falsa alarma) deja de
        // mostrarse a los vecinos; pendiente y validada sí, para no retrasar
        // el aviso mientras se confirma.
        this.avisos = avisos.filter(aviso => !(aviso.tipoAviso === 'alerta' && aviso.estado === 'rechazado'));
        this.notificaciones = notificaciones;
        this.tarjetas = this.crearTarjetas(this.avisos, notificaciones);
        this.aplicarFiltro();
        this.cdr.markForCheck();
      },
      error: error => {
        console.error('Error cargando avisos:', error);
        this.cargaError = 'No se pudieron cargar los datos. Revisa tu conexión e intenta de nuevo.';
        this.cdr.markForCheck();
      },
    });

    this.firestoreService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });

    // La página usa OnPush: sin este tick, "hace 2 minutos" se queda
    // congelado hasta la próxima carga de datos o interacción del usuario,
    // en vez de ir avanzando por sí solo mientras la pantalla está abierta.
    interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  esFuturo(fecha: string | undefined): boolean {
    return !!fecha && new Date(fecha).getTime() > Date.now();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalEmergencias(): number {
    return this.avisos.filter(aviso => aviso.tipoAviso === 'emergencia' || aviso.tipoAviso === 'alerta').length;
  }

  get totalPendientes(): number {
    return this.notificaciones.filter(notificacion => !this.isReminderCompleted(notificacion)).length;
  }

  cambiarFiltro(filtro: FiltroPanel): void {
    if (this.filtro === filtro) {
      return;
    }
    this.filtro = filtro;
    this.aplicarFiltro();
    this.cdr.markForCheck();
  }

  private aplicarFiltro(): void {
    this.tarjetasVisibles = this.filtro === 'todos'
      ? this.tarjetas
      : this.tarjetas.filter(tarjeta => tarjeta.tipo === this.filtro);
  }

  private completarAutores(avisos: Aviso[]) {
    const avisosSinAutor = avisos.filter(aviso => aviso.autorId && !aviso.autorNombre);

    if (!avisosSinAutor.length) {
      return of(avisos);
    }

    const autoresUnicos = Array.from(new Set(avisosSinAutor.map(aviso => aviso.autorId)));
    const consultasAutores = autoresUnicos.map(autorId =>
      this.firestoreService.getUsuarioById(autorId).pipe(
        map(usuario => [autorId, usuario?.nombre || autorId] as const)
      )
    );

    return forkJoin(consultasAutores).pipe(
      map(autores => {
        const autoresMap = new Map(autores);
        return avisos.map(aviso => ({
          ...aviso,
          autorNombre: aviso.autorNombre || autoresMap.get(aviso.autorId) || aviso.autorId,
        }));
      })
    );
  }

  private crearTarjetas(avisos: Aviso[], notificaciones: Notificacion[]): PanelCard[] {
    const tarjetasAvisos: PanelCard[] = avisos.map(aviso => ({
      tipo: 'aviso',
      id: aviso.idAviso || `aviso-${aviso.fechaPublicacion}-${aviso.tituloAviso}`,
      aviso,
      fecha: aviso.fechaPublicacion || '',
    }));

    const tarjetasNotificaciones: PanelCard[] = notificaciones.map(notificacion => ({
      tipo: 'notificacion',
      id: notificacion.idNotificaciones || `notificacion-${notificacion.fechaHora}-${notificacion.tituloNotificacion}`,
      notificacion,
      fecha: notificacion.fechaHora,
    }));

    return [...tarjetasAvisos, ...tarjetasNotificaciones].sort((a, b) =>
      this.getTimestamp(b.fecha) - this.getTimestamp(a.fecha)
    );
  }

  private getTimestamp(fecha: string): number {
    const timestamp = new Date(fecha).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  abrirModal(tarjeta: PanelCard): void {
    if (tarjeta.tipo === 'aviso' && tarjeta.aviso) {
      this.modalData = {
        variant: 'aviso',
        titulo: tarjeta.aviso.tituloAviso || 'Sin título',
        descripcion: tarjeta.aviso.descripcionAviso || 'Sin descripción',
        fecha: tarjeta.aviso.fechaPublicacion,
        ubicacion: tarjeta.aviso.ubicacionAviso,
        enlaceMapa: tarjeta.aviso.latitud !== undefined && tarjeta.aviso.longitud !== undefined
          ? enlaceMapa(tarjeta.aviso.latitud, tarjeta.aviso.longitud)
          : undefined,
        precisionMetros: tarjeta.aviso.precisionMetros,
        tipo: tarjeta.aviso.tipoAviso,
        autor: tarjeta.aviso.autorNombre || tarjeta.aviso.autorId || 'Autor no disponible',
        imagen: tarjeta.aviso.imagen,
      };
    } else if (tarjeta.tipo === 'notificacion' && tarjeta.notificacion) {
      this.modalData = {
        variant: 'notificacion',
        titulo: tarjeta.notificacion.tituloNotificacion || 'Notificación',
        descripcion: tarjeta.notificacion.descripcionNotificacion || 'Sin descripción',
        fecha: tarjeta.notificacion.fechaHora,
      };
    } else {
      return;
    }

    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.modalData = null;
  }

  onModalBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cerrarModal();
    }
  }

  isPriorityImage(index: number): boolean {
    return index < 3;
  }

  isReminderCompleted(notificacion: Notificacion | undefined): boolean {
    if (!notificacion) return false;
    if (notificacion.estado === 'completado') return true;
    const reminderTime = new Date(notificacion.fechaHora).getTime();
    return reminderTime < Date.now();
  }

  trackByCardId(_: number, tarjeta: PanelCard): string {
    return tarjeta.id;
  }
}
