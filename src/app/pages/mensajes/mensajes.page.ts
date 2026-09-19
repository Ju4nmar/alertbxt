import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, paperPlaneOutline } from 'ionicons/icons';
import { Subject, Subscription, filter, finalize, switchMap, take, takeUntil } from 'rxjs';
import { MensajeAdmin, MensajeEnviado, RespuestaMensaje, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { MensajesService } from '../../services/mensajes.service';
import { ToastService } from '../../services/toast.service';

type Vista = 'recibidos' | 'enviados';

@Component({
  selector: 'app-mensajes',
  templateUrl: './mensajes.page.html',
  styleUrls: ['./mensajes.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
})
export class MensajesPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly mensajesService = inject(MensajesService);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private respuestasSub?: Subscription;

  usuario: Usuario | null = null;
  vista: Vista = 'recibidos';

  mensajesRecibidos: MensajeAdmin[] = [];
  mensajesEnviados: MensajeEnviado[] = [];
  isLoading = true;
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  hiloAbierto: string | null = null;
  cargandoRespuestas = false;
  respuestasPorHilo: Record<string, RespuestaMensaje[]> = {};
  textoRespuesta = '';
  enviandoRespuesta = false;

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
  }

  get usuarioId(): string {
    return this.usuario?.idUsuario || '';
  }

  constructor() {
    addIcons({ chatbubbleEllipsesOutline, paperPlaneOutline });
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
        filter(user => !!user?.idUsuario),
        switchMap(user => this.mensajesService.getMensajesByUsuario(user!.idUsuario!)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: mensajes => {
          this.mensajesRecibidos = mensajes;
          this.isLoading = false;
        },
        error: error => {
          console.error('Error cargando mensajes recibidos:', error);
          this.isLoading = false;
          this.cargaError = 'No se pudieron cargar los mensajes. Revisa tu conexión e intenta de nuevo.';
        },
      });

    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.idUsuario && user?.rol === 'admin'),
        switchMap(user => this.mensajesService.getMensajesEnviados(user!.idUsuario!)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: mensajes => this.mensajesEnviados = mensajes,
        error: error => console.error('Error cargando mensajes enviados:', error),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cambiarVista(vista: Vista): void {
    this.vista = vista;
    this.cerrarHilo();
  }

  formatearDestinatarios(mensaje: MensajeEnviado): string {
    const nombres = mensaje.destinatarios.map(d => d.nombre);
    if (nombres.length <= 2) {
      return nombres.join(' y ');
    }
    return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
  }

  hiloEstaAbierto(uidDueno: string, mensajeId: string | undefined): boolean {
    return !!mensajeId && this.hiloAbierto === this.claveHilo(uidDueno, mensajeId);
  }

  respuestasDe(uidDueno: string, mensajeId: string | undefined): RespuestaMensaje[] {
    if (!mensajeId) {
      return [];
    }
    return this.respuestasPorHilo[this.claveHilo(uidDueno, mensajeId)] || [];
  }

  toggleHilo(uidDueno: string, mensajeId: string | undefined): void {
    if (!mensajeId) {
      return;
    }

    if (this.hiloEstaAbierto(uidDueno, mensajeId)) {
      this.cerrarHilo();
      return;
    }

    const clave = this.claveHilo(uidDueno, mensajeId);
    this.hiloAbierto = clave;
    this.textoRespuesta = '';
    this.respuestasSub?.unsubscribe();
    this.cargandoRespuestas = true;
    this.respuestasSub = this.mensajesService.getRespuestas(uidDueno, mensajeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: respuestas => {
          this.respuestasPorHilo[clave] = respuestas;
          this.cargandoRespuestas = false;
        },
        error: error => {
          console.error('Error cargando respuestas del mensaje:', error);
          this.cargandoRespuestas = false;
        },
      });
  }

  enviarRespuesta(mensaje: MensajeAdmin): void {
    const texto = this.textoRespuesta.trim();
    if (!texto || !mensaje.idMensaje || this.enviandoRespuesta) {
      return;
    }

    this.enviandoRespuesta = true;
    this.mensajesService.responderMensaje(mensaje.idMensaje, texto)
      .pipe(take(1), finalize(() => this.enviandoRespuesta = false), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.textoRespuesta = '';
        },
        error: error => {
          console.error('Error enviando respuesta:', error);
          this.toastService.error(error?.message || 'No se pudo enviar la respuesta.');
        },
      });
  }

  private cerrarHilo(): void {
    this.hiloAbierto = null;
    this.respuestasSub?.unsubscribe();
  }

  private claveHilo(uidDueno: string, mensajeId: string): string {
    return `${uidDueno}:${mensajeId}`;
  }
}
