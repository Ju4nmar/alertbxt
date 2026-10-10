import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, paperPlaneOutline } from 'ionicons/icons';
import { Subject, Subscription, filter, finalize, switchMap, take, takeUntil } from 'rxjs';
import { MensajeAdmin, MensajeEnviado, RespuestaMensaje, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { MensajesService } from '../../services/mensajes.service';
import { ToastService } from '../../services/toast.service';
import { etiquetaRol } from '../../utils/rol.utils';
import { formatearUnidad } from '../../utils/ubicacion.utils';

type Vista = 'recibidos' | 'enviados';

// Por encima de estos límites el texto se recorta y aparece "Ver más".
const UMBRAL_TEXTO_LARGO = 280;
const LINEAS_TEXTO_LARGO = 5;

@Component({
  selector: 'app-mensajes',
  templateUrl: './mensajes.page.html',
  styleUrls: ['./mensajes.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
})
export class MensajesPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
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
  readonly textosExpandidos = new Set<string>();

  // Vista estilo correo: lista a la izquierda, detalle de lectura a la
  // derecha (en móvil, una pantalla reemplaza a la otra).
  mensajeRecibidoSeleccionado: MensajeAdmin | null = null;
  mensajeEnviadoSeleccionado: MensajeEnviado | null = null;

  get hayDetalleAbierto(): boolean {
    return !!this.mensajeRecibidoSeleccionado || !!this.mensajeEnviadoSeleccionado;
  }

  // Contexto de las personas del mensaje (rol, torre y apartamento), para
  // que quien lee sepa con quién habla sin salir de la bandeja.
  private readonly perfiles: Record<string, Usuario | null> = {};
  private readonly perfilesPedidos = new Set<string>();
  private comunidadEsDeCasas = false;
  private comunidadPedida = false;
  readonly maxDestinatariosVisibles = 20;

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
        this.cargarTipoComunidad(user?.comunidadId);
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
    this.cerrarDetalle();
  }

  seleccionarRecibido(mensaje: MensajeAdmin): void {
    this.mensajeEnviadoSeleccionado = null;
    this.mensajeRecibidoSeleccionado = mensaje;
    this.cargarPerfil(mensaje.autorId);

    // Una respuesta que le llega al admin se lee tal cual; el hilo (y el
    // cuadro para contestar) pertenece al mensaje original.
    if (mensaje.esRespuesta) {
      this.cerrarHilo();
      return;
    }
    this.abrirHilo(this.usuarioId, mensaje.idMensaje);
  }

  seleccionarEnviado(mensaje: MensajeEnviado): void {
    this.mensajeRecibidoSeleccionado = null;
    this.mensajeEnviadoSeleccionado = mensaje;
    this.destinatariosVisibles(mensaje).forEach(destinatario => this.cargarPerfil(destinatario.id));
    const primerDestinatario = mensaje.destinatarios[0];
    if (primerDestinatario) {
      this.abrirHilo(primerDestinatario.id, primerDestinatario.mensajeId);
    }
  }

  esRecibidoSeleccionado(mensaje: MensajeAdmin): boolean {
    return !!this.mensajeRecibidoSeleccionado?.idMensaje && this.mensajeRecibidoSeleccionado.idMensaje === mensaje.idMensaje;
  }

  esEnviadoSeleccionado(mensaje: MensajeEnviado): boolean {
    return !!this.mensajeEnviadoSeleccionado?.idMensaje && this.mensajeEnviadoSeleccionado.idMensaje === mensaje.idMensaje;
  }

  destinatariosVisibles(mensaje: MensajeEnviado): MensajeEnviado['destinatarios'] {
    return mensaje.destinatarios.slice(0, this.maxDestinatariosVisibles);
  }

  // "Propietario · Torre 10 - Apto 302"; vacío mientras carga el perfil.
  contextoDe(uid: string | undefined): string {
    const perfil = uid ? this.perfiles[uid] : null;
    if (!perfil) {
      return '';
    }
    return [etiquetaRol(perfil.rol), formatearUnidad(perfil, this.comunidadEsDeCasas)].filter(Boolean).join(' · ');
  }

  cerrarDetalle(): void {
    this.mensajeRecibidoSeleccionado = null;
    this.mensajeEnviadoSeleccionado = null;
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

  // Para los chips de destinatario dentro del detalle de un enviado: alternan
  // entre mostrar y ocultar el hilo de ese destinatario.
  toggleHilo(uidDueno: string, mensajeId: string | undefined): void {
    if (!mensajeId) {
      return;
    }

    if (this.hiloEstaAbierto(uidDueno, mensajeId)) {
      this.hiloAbierto = null;
      this.respuestasSub?.unsubscribe();
      return;
    }

    this.abrirHilo(uidDueno, mensajeId);
  }

  private cargarPerfil(uid: string | undefined): void {
    if (!uid || this.perfilesPedidos.has(uid)) {
      return;
    }

    this.perfilesPedidos.add(uid);
    this.firestoreService.getUsuarioById(uid)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: perfil => this.perfiles[uid] = perfil,
        error: () => this.perfiles[uid] = null,
      });
  }

  private cargarTipoComunidad(comunidadId: string | undefined): void {
    if (!comunidadId || this.comunidadPedida) {
      return;
    }

    this.comunidadPedida = true;
    this.firestoreService.getComunidadById(comunidadId)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: comunidad => this.comunidadEsDeCasas = comunidad?.tipoComunidad === 'casas',
        error: () => this.comunidadEsDeCasas = false,
      });
  }

  private abrirHilo(uidDueno: string, mensajeId: string | undefined): void {
    if (!mensajeId || this.hiloEstaAbierto(uidDueno, mensajeId)) {
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

  esTextoLargo(texto: string | undefined): boolean {
    if (!texto) {
      return false;
    }
    return texto.length > UMBRAL_TEXTO_LARGO || texto.split('\n').length > LINEAS_TEXTO_LARGO;
  }

  textoExpandido(clave: string | undefined): boolean {
    return !!clave && this.textosExpandidos.has(clave);
  }

  alternarTexto(clave: string | undefined): void {
    if (!clave) {
      return;
    }
    if (!this.textosExpandidos.delete(clave)) {
      this.textosExpandidos.add(clave);
    }
  }

  private cerrarHilo(): void {
    this.hiloAbierto = null;
    this.respuestasSub?.unsubscribe();
  }

  private claveHilo(uidDueno: string, mensajeId: string): string {
    return `${uidDueno}:${mensajeId}`;
  }
}
