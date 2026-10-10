import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, calendarOutline, createOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { BehaviorSubject, Subject, catchError, combineLatest, distinctUntilChanged, filter, firstValueFrom, of, switchMap, takeUntil } from 'rxjs';
import { Reserva, Usuario, ZonaComun } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import {
  GrupoReserva,
  agruparReservas,
  alternarBloque,
  etiquetaHora,
  fechaLocalISO,
  horasDeZona,
  idReserva,
  inicioDeBloque,
} from '../../utils/reservas.utils';

type EstadoBloque = 'libre' | 'ocupado' | 'mio' | 'pasado' | 'seleccionado';

const DIAS_ANTICIPACION = 30;

@Component({
  selector: 'app-reservas',
  templateUrl: './reservas.page.html',
  styleUrls: ['./reservas.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonIcon],
})
export class ReservasPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly consulta$ = new BehaviorSubject<{ zonaId: string; fecha: string } | null>(null);

  constructor() {
    addIcons({ addOutline, calendarOutline, createOutline, timeOutline, trashOutline });
  }

  usuario: Usuario | null = null;
  zonas: ZonaComun[] = [];
  zonaId = '';
  fecha = fechaLocalISO(new Date());
  readonly fechaMin = fechaLocalISO(new Date());
  readonly fechaMax = fechaLocalISO(new Date(Date.now() + DIAS_ANTICIPACION * 24 * 60 * 60 * 1000));
  ocupadas: Reserva[] = [];
  seleccion: number[] = [];
  misReservas: GrupoReserva[] = [];
  reservasComunidad: GrupoReserva[] = [];
  isLoading = true;
  reservando = false;
  cargaError = '';

  zonaFormAbierto = false;
  zonaEditandoId: string | null = null;
  guardandoZona = false;
  zonaError = '';
  zonaNombre = '';
  zonaDescripcion = '';
  zonaApertura = 6;
  zonaCierre = 22;
  zonaMaxHoras = 2;

  readonly horasOpciones = Array.from({ length: 25 }, (_, i) => i);

  ngOnInit(): void {
    const usuario$ = this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId && !!user?.idUsuario),
      distinctUntilChanged((previous, current) =>
        previous.comunidadId === current.comunidadId && previous.idUsuario === current.idUsuario
      ),
      takeUntil(this.destroy$)
    );

    usuario$.pipe(
      switchMap(user => {
        this.usuario = user;
        return this.firestoreService.getZonasByComunidad(user.comunidadId).pipe(catchError(error => this.fallo(error, [] as ZonaComun[])));
      }),
      takeUntil(this.destroy$)
    ).subscribe(zonas => {
      this.zonas = zonas;
      if (!zonas.some(zona => zona.idZona === this.zonaId)) {
        this.zonaId = zonas[0]?.idZona ?? '';
        this.seleccion = [];
      }
      this.isLoading = false;
      this.consultarOcupacion();
      this.cdr.markForCheck();
    });

    usuario$.pipe(
      switchMap(user => this.firestoreService.getReservasDeUsuario(user.idUsuario || '', user.comunidadId).pipe(catchError(error => this.fallo(error, [] as Reserva[])))),
      takeUntil(this.destroy$)
    ).subscribe(reservas => {
      this.misReservas = this.proximas(reservas);
      this.cdr.markForCheck();
    });

    usuario$.pipe(
      switchMap(user => user.rol === 'admin'
        ? this.firestoreService.getReservasDeComunidad(user.comunidadId).pipe(catchError(error => this.fallo(error, [] as Reserva[])))
        : of([] as Reserva[])),
      takeUntil(this.destroy$)
    ).subscribe(reservas => {
      this.reservasComunidad = this.proximas(reservas);
      this.cdr.markForCheck();
    });

    combineLatest([usuario$, this.consulta$]).pipe(
      switchMap(([user, consulta]) => consulta
        ? this.firestoreService.getReservasDeZonaYFecha(user.comunidadId, consulta.zonaId, consulta.fecha).pipe(catchError(error => this.fallo(error, [] as Reserva[])))
        : of([] as Reserva[])),
      takeUntil(this.destroy$)
    ).subscribe(reservas => {
      this.ocupadas = reservas;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  get zona(): ZonaComun | undefined {
    return this.zonas.find(zona => zona.idZona === this.zonaId);
  }

  get bloques(): number[] {
    return this.zona ? horasDeZona(this.zona) : [];
  }

  get maxHoras(): number {
    return this.zona?.maxHoras ?? 1;
  }

  // El tope es por vecino, día y zona: lo que ya reservó ese día descuenta
  // del cupo (el servidor lo hace cumplir también, ver onReservaCreada).
  get horasYaReservadas(): number {
    return this.ocupadas.filter(reserva => reserva.usuarioId === this.usuario?.idUsuario).length;
  }

  get cupoRestante(): number {
    return Math.max(0, this.maxHoras - this.horasYaReservadas);
  }

  etiqueta(hora: number): string {
    return etiquetaHora(hora);
  }

  cambiarZona(idZona: string): void {
    this.zonaId = idZona;
    this.seleccion = [];
    this.consultarOcupacion();
  }

  cambiarFecha(): void {
    this.seleccion = [];
    this.consultarOcupacion();
  }

  estadoDe(hora: number): EstadoBloque {
    const reservada = this.ocupadas.find(reserva => reserva.hora === hora);
    if (reservada) {
      return reservada.usuarioId === this.usuario?.idUsuario ? 'mio' : 'ocupado';
    }
    if (inicioDeBloque(this.fecha, hora).getTime() <= Date.now()) {
      return 'pasado';
    }
    return this.seleccion.includes(hora) ? 'seleccionado' : 'libre';
  }

  quienReservo(hora: number): string {
    const reserva = this.ocupadas.find(r => r.hora === hora);
    if (!reserva) {
      return '';
    }
    const lugar = [reserva.torre ? `Torre ${reserva.torre}` : '', reserva.apartamento ? `Apto/Casa ${reserva.apartamento}` : '']
      .filter(Boolean).join(' - ');
    return lugar || reserva.usuarioNombre;
  }

  tocarBloque(hora: number): void {
    const estado = this.estadoDe(hora);
    if ((estado === 'libre' || estado === 'seleccionado') && this.cupoRestante > 0) {
      this.seleccion = alternarBloque(this.seleccion, hora, this.cupoRestante);
    }
  }

  get resumenSeleccion(): string {
    if (!this.seleccion.length) {
      return '';
    }
    const ultima = this.seleccion[this.seleccion.length - 1] + 1;
    return `${etiquetaHora(this.seleccion[0])} a ${etiquetaHora(ultima)}`;
  }

  async reservar(): Promise<void> {
    const usuario = this.usuario;
    const zona = this.zona;
    if (!usuario || !zona?.idZona || !this.seleccion.length || this.reservando) {
      return;
    }

    this.reservando = true;
    try {
      await firstValueFrom(this.firestoreService.crearReservas(this.seleccion.map(hora => ({
        id: idReserva(zona.idZona as string, this.fecha, hora),
        zonaId: zona.idZona as string,
        zonaNombre: zona.nombre,
        comunidadId: usuario.comunidadId,
        usuarioId: usuario.idUsuario || '',
        usuarioNombre: usuario.nombre,
        torre: usuario.torre || undefined,
        apartamento: usuario.numeroApartamento || undefined,
        fecha: this.fecha,
        hora,
        inicio: inicioDeBloque(this.fecha, hora),
      }))));
      this.seleccion = [];
      await this.avisar('Reserva confirmada.');
    } catch (error) {
      console.error('Error reservando:', error);
      await this.avisar('No se pudo reservar: alguien tomó ese horario antes que tú. Elige otro.');
    } finally {
      this.reservando = false;
      this.cdr.markForCheck();
    }
  }

  async cancelar(grupo: GrupoReserva): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cancelar reserva',
      message: `¿Cancelar ${grupo.zonaNombre} el ${grupo.fecha}, de ${etiquetaHora(grupo.horaInicio)} a ${etiquetaHora(grupo.horaFin)}?`,
      buttons: [
        { text: 'Volver', role: 'cancel' },
        {
          text: 'Cancelar reserva',
          role: 'destructive',
          handler: () => {
            void firstValueFrom(this.firestoreService.cancelarReservas(grupo.ids))
              .then(() => this.avisar('Reserva cancelada.'))
              .catch(() => this.avisar('No se pudo cancelar la reserva.'));
          },
        },
      ],
    });
    await alert.present();
  }

  editarZona(zona: ZonaComun): void {
    this.abrirFormularioZona();
    this.zonaEditandoId = zona.idZona || null;
    this.zonaNombre = zona.nombre;
    this.zonaDescripcion = zona.descripcion || '';
    this.zonaApertura = zona.horaApertura;
    this.zonaCierre = zona.horaCierre;
    this.zonaMaxHoras = zona.maxHoras;
  }

  abrirFormularioZona(): void {
    this.zonaEditandoId = null;
    this.zonaFormAbierto = true;
    this.zonaError = '';
    this.zonaNombre = '';
    this.zonaDescripcion = '';
    this.zonaApertura = 6;
    this.zonaCierre = 22;
    this.zonaMaxHoras = 2;
  }

  cancelarFormularioZona(): void {
    this.zonaFormAbierto = false;
    this.zonaEditandoId = null;
  }

  async guardarZona(): Promise<void> {
    if (!this.usuario || this.guardandoZona) {
      return;
    }
    const nombre = this.zonaNombre.trim();
    const apertura = Number(this.zonaApertura);
    const cierre = Number(this.zonaCierre);
    const maxHoras = Number(this.zonaMaxHoras);

    if (nombre.length < 2 || nombre.length > 60) {
      this.zonaError = 'El nombre debe tener entre 2 y 60 caracteres.';
      return;
    }
    if (!(apertura >= 0 && cierre <= 24 && apertura < cierre)) {
      this.zonaError = 'La hora de apertura debe ser anterior a la de cierre.';
      return;
    }
    if (!(maxHoras >= 1 && maxHoras <= 8)) {
      this.zonaError = 'El máximo por reserva debe estar entre 1 y 8 horas.';
      return;
    }

    this.guardandoZona = true;
    this.zonaError = '';
    try {
      const descripcion = this.zonaDescripcion.trim();
      if (this.zonaEditandoId) {
        // Las reservas ya hechas no cambian: si se acorta el horario, las que
        // queden fuera siguen vigentes hasta que se cancelen.
        await firstValueFrom(this.firestoreService.updateZona(this.zonaEditandoId, {
          nombre,
          ...(descripcion ? { descripcion } : {}),
          horaApertura: apertura,
          horaCierre: cierre,
          maxHoras,
        }));
        this.zonaFormAbierto = false;
        this.zonaEditandoId = null;
        await this.avisar('Zona actualizada.');
        return;
      }
      await firstValueFrom(this.firestoreService.addZona({
        nombre,
        ...(descripcion ? { descripcion } : {}),
        comunidadId: this.usuario.comunidadId,
        horaApertura: apertura,
        horaCierre: cierre,
        maxHoras,
      }));
      this.zonaFormAbierto = false;
      await this.avisar('Zona creada.');
    } catch (error) {
      console.error('Error creando zona:', error);
      this.zonaError = 'No se pudo crear la zona. Intenta de nuevo.';
    } finally {
      this.guardandoZona = false;
      this.cdr.markForCheck();
    }
  }

  async eliminarZona(zona: ZonaComun): Promise<void> {
    if (!zona.idZona) {
      return;
    }
    const id = zona.idZona;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar zona',
      message: `¿Eliminar «${zona.nombre}»? Dejará de poder reservarse.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void firstValueFrom(this.firestoreService.deleteZona(id)).catch(() => this.avisar('No se pudo eliminar la zona.'));
          },
        },
      ],
    });
    await alert.present();
  }

  trackByHora(_: number, hora: number): number {
    return hora;
  }

  trackByZona(_: number, zona: ZonaComun): string {
    return zona.idZona || zona.nombre;
  }

  trackByGrupo(_: number, grupo: GrupoReserva): string {
    return grupo.ids[0];
  }

  private consultarOcupacion(): void {
    this.consulta$.next(this.zonaId ? { zonaId: this.zonaId, fecha: this.fecha } : null);
  }

  // Solo lo que aún no terminó.
  private proximas(reservas: Reserva[]): GrupoReserva[] {
    const ahora = Date.now();
    return agruparReservas(reservas).filter(grupo => inicioDeBloque(grupo.fecha, grupo.horaFin).getTime() > ahora);
  }

  private fallo<T>(error: unknown, valor: T) {
    console.error('Error cargando reservas:', error);
    this.cargaError = 'No se pudo cargar toda la información. Revisa tu conexión e intenta de nuevo.';
    return of(valor);
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
