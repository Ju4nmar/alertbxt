import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkCircle, closeCircleOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { Subject, catchError, distinctUntilChanged, filter, firstValueFrom, forkJoin, map, of, switchMap, takeUntil } from 'rxjs';
import { Encuesta, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

const OPCIONES_MIN = 2;
const OPCIONES_MAX = 6;

@Component({
  selector: 'app-encuestas',
  templateUrl: './encuestas.page.html',
  styleUrls: ['./encuestas.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonIcon],
})
export class EncuestasPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  constructor() {
    addIcons({ addOutline, checkmarkCircle, closeCircleOutline, timeOutline, trashOutline });
  }

  usuario: Usuario | null = null;
  encuestas: Encuesta[] = [];
  misVotos: Record<string, number | null> = {};
  seleccion: Record<string, number> = {};
  votando: Record<string, boolean> = {};
  isLoading = true;
  cargaError = '';

  formAbierto = false;
  idEditando: string | null = null;
  private encuestaEditada: Encuesta | null = null;
  publicando = false;
  formError = '';
  titulo = '';
  descripcion = '';
  opciones: string[] = ['', ''];
  cierre = '';
  soloPropietarios = false;

  readonly opcionesMax = OPCIONES_MAX;

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId && !!user?.idUsuario),
      distinctUntilChanged((previous, current) =>
        previous.comunidadId === current.comunidadId && previous.idUsuario === current.idUsuario
      ),
      switchMap(user => {
        this.usuario = user;
        return this.firestoreService.getEncuestasByComunidad(user.comunidadId, user.rol);
      }),
      switchMap(encuestas => {
        this.encuestas = encuestas;
        const pendientes = encuestas.filter(e => e.idEncuesta && !(e.idEncuesta in this.misVotos));
        if (!pendientes.length) {
          return of([] as { id: string; voto: number | null }[]);
        }
        return forkJoin(pendientes.map(e =>
          this.firestoreService.getMiVoto(e.idEncuesta as string, this.usuario?.idUsuario || '').pipe(
            catchError(() => of(null)),
            map(voto => ({ id: e.idEncuesta as string, voto }))
          )
        ));
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: votos => {
        votos.forEach(({ id, voto }) => (this.misVotos[id] = voto));
        this.cargaError = '';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        console.error('Error cargando encuestas:', error);
        this.cargaError = 'No se pudieron cargar las encuestas. Revisa tu conexión e intenta de nuevo.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  estaAbierta(encuesta: Encuesta): boolean {
    return new Date(encuesta.cierre).getTime() > Date.now();
  }

  yaVoto(encuesta: Encuesta): boolean {
    return this.misVotos[encuesta.idEncuesta || ''] != null;
  }

  puedeVotar(encuesta: Encuesta): boolean {
    return this.estaAbierta(encuesta) && !this.yaVoto(encuesta);
  }

  mostrarResultados(encuesta: Encuesta): boolean {
    return this.esAdmin || !this.puedeVotar(encuesta);
  }

  porcentaje(encuesta: Encuesta, indice: number): number {
    if (!encuesta.totalVotos) {
      return 0;
    }
    return Math.round(((encuesta.conteo[String(indice)] ?? 0) / encuesta.totalVotos) * 100);
  }

  votosDe(encuesta: Encuesta, indice: number): number {
    return encuesta.conteo[String(indice)] ?? 0;
  }

  elegir(encuesta: Encuesta, indice: number): void {
    this.seleccion[encuesta.idEncuesta || ''] = indice;
  }

  async votar(encuesta: Encuesta): Promise<void> {
    const id = encuesta.idEncuesta;
    const uid = this.usuario?.idUsuario;
    const opcion = id ? this.seleccion[id] : undefined;
    if (!id || !uid || opcion === undefined || this.votando[id] || !this.puedeVotar(encuesta)) {
      return;
    }

    this.votando[id] = true;
    try {
      await firstValueFrom(this.firestoreService.votarEncuesta(id, uid, opcion));
      this.misVotos[id] = opcion;
      await this.avisar('Voto registrado. ¡Gracias por participar!');
    } catch (error) {
      console.error('Error votando:', error);
      await this.avisar('No se pudo registrar tu voto. Puede que la encuesta ya haya cerrado.');
    } finally {
      this.votando[id] = false;
      this.cdr.markForCheck();
    }
  }

  // Con votos emitidos no se pueden cambiar las opciones (falsearía los
  // resultados): se muestran bloqueadas.
  get opcionesBloqueadas(): boolean {
    return !!this.encuestaEditada && this.encuestaEditada.totalVotos > 0;
  }

  editar(encuesta: Encuesta): void {
    this.abrirFormulario();
    this.idEditando = encuesta.idEncuesta || null;
    this.encuestaEditada = encuesta;
    this.titulo = encuesta.titulo;
    this.descripcion = encuesta.descripcion || '';
    this.opciones = [...encuesta.opciones];
    this.soloPropietarios = encuesta.soloPropietarios;
    this.cierre = this.formatoLocal(new Date(encuesta.cierre));
  }

  abrirFormulario(): void {
    this.idEditando = null;
    this.encuestaEditada = null;
    this.formAbierto = true;
    this.formError = '';
    this.titulo = '';
    this.descripcion = '';
    this.opciones = ['', ''];
    this.soloPropietarios = false;
    this.cierre = this.formatoLocal(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  }

  cancelarFormulario(): void {
    this.formAbierto = false;
    this.idEditando = null;
    this.encuestaEditada = null;
  }

  agregarOpcion(): void {
    if (this.opciones.length < OPCIONES_MAX) {
      this.opciones = [...this.opciones, ''];
    }
  }

  quitarOpcion(indice: number): void {
    if (this.opciones.length > OPCIONES_MIN) {
      this.opciones = this.opciones.filter((_, i) => i !== indice);
    }
  }

  trackByIndice(indice: number): number {
    return indice;
  }

  trackByEncuesta(_: number, encuesta: Encuesta): string {
    return encuesta.idEncuesta || '';
  }

  async publicar(): Promise<void> {
    if (!this.usuario || this.publicando) {
      return;
    }

    const titulo = this.titulo.trim();
    const opciones = this.opciones.map(o => o.trim()).filter(Boolean);
    const cierre = new Date(this.cierre);

    if (titulo.length < 3 || titulo.length > 120) {
      this.formError = 'El título debe tener entre 3 y 120 caracteres.';
      return;
    }
    if (!this.opcionesBloqueadas
      && (opciones.length < OPCIONES_MIN || new Set(opciones.map(o => o.toLowerCase())).size !== opciones.length)) {
      this.formError = 'Escribe al menos dos opciones distintas.';
      return;
    }
    // Al editar una encuesta ya cerrada se puede dejar el cierre como está.
    const cierreSinCambios = !!this.encuestaEditada
      && Math.abs(new Date(this.encuestaEditada.cierre).getTime() - cierre.getTime()) < 60_000;
    if (Number.isNaN(cierre.getTime()) || (cierre.getTime() <= Date.now() && !cierreSinCambios)) {
      this.formError = 'La fecha de cierre debe ser futura.';
      return;
    }

    this.publicando = true;
    this.formError = '';
    try {
      const descripcion = this.descripcion.trim();
      if (this.idEditando) {
        await firstValueFrom(this.firestoreService.updateEncuesta(this.idEditando, {
          titulo,
          descripcion,
          cierre: cierreSinCambios && this.encuestaEditada ? this.encuestaEditada.cierre : cierre.toISOString(),
          ...(this.opcionesBloqueadas ? {} : { opciones }),
        }));
        this.formAbierto = false;
        this.idEditando = null;
        this.encuestaEditada = null;
        await this.avisar('Encuesta actualizada.');
        return;
      }
      await firstValueFrom(this.firestoreService.addEncuesta({
        titulo,
        ...(descripcion ? { descripcion } : {}),
        opciones,
        comunidadId: this.usuario.comunidadId,
        autorId: this.usuario.idUsuario || '',
        autorNombre: this.usuario.nombre,
        soloPropietarios: this.soloPropietarios,
        cierre: cierre.toISOString(),
      }));
      this.formAbierto = false;
      await this.avisar('Encuesta publicada. Se avisó a la comunidad.');
    } catch (error) {
      console.error('Error publicando encuesta:', error);
      this.formError = 'No se pudo publicar la encuesta. Intenta de nuevo.';
    } finally {
      this.publicando = false;
      this.cdr.markForCheck();
    }
  }

  async cerrarAhora(encuesta: Encuesta): Promise<void> {
    if (!encuesta.idEncuesta) {
      return;
    }
    const id = encuesta.idEncuesta;
    await this.confirmar('Cerrar encuesta', '¿Cerrar «' + encuesta.titulo + '» ahora? Nadie más podrá votar.', 'Cerrar', async () => {
      await firstValueFrom(this.firestoreService.cerrarEncuesta(id));
    }, 'No se pudo cerrar la encuesta.');
  }

  async eliminar(encuesta: Encuesta): Promise<void> {
    if (!encuesta.idEncuesta) {
      return;
    }
    const id = encuesta.idEncuesta;
    await this.confirmar('Eliminar encuesta', '¿Eliminar «' + encuesta.titulo + '» y sus resultados? No se puede deshacer.', 'Eliminar', async () => {
      await firstValueFrom(this.firestoreService.deleteEncuesta(id));
    }, 'No se pudo eliminar la encuesta.');
  }

  private async confirmar(header: string, message: string, accion: string, ejecutar: () => Promise<void>, errorMsg: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: accion,
          role: 'destructive',
          handler: () => {
            void ejecutar().catch(async error => {
              console.error(errorMsg, error);
              await this.avisar(errorMsg);
            });
          },
        },
      ],
    });
    await alert.present();
  }

  private formatoLocal(fecha: Date): string {
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2800, position: 'bottom' });
    await toast.present();
  }
}
