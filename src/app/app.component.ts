import { CommonModule } from '@angular/common';
import { Component, HostListener, NgZone, OnDestroy, ViewEncapsulation, inject, isDevMode } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import {
  AlertController,
  IonApp,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonSplitPane,
  IonToolbar,
  MenuController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircle, calendar, chatbubbleEllipses, download, helpCircleOutline, logOut, moonOutline, sunnyOutline, notifications, notificationsOutline, people, person, personCircle, statsChart } from 'ionicons/icons';
import { Subject, filter, firstValueFrom, takeUntil } from 'rxjs';
import { Aviso, Usuario } from './models';
import { AuthService } from './services/auth.service';
import { FirestoreService } from './services/firestore.service';
import { FcmService } from './services/fcm.service';
import { LocalNotificationService } from './services/local-notification.service';
import { PwaInstallService } from './services/pwa-install.service';
import { TIPOS_ALERTA_SOS, formatearUnidad, obtenerPosicion } from './utils/ubicacion.utils';
import { ThemeService } from './services/theme.service';
import { TourService } from './services/tour.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonButton,
    IonHeader,
    IonToolbar,
    IonButtons,
  ],
})
export class AppComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly menuController = inject(MenuController);
  private readonly ngZone = inject(NgZone);
  private readonly firestoreService = inject(FirestoreService);
  private readonly alertCtrl = inject(AlertController);
  private readonly authService = inject(AuthService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private readonly fcmService = inject(FcmService);
  private readonly pwaInstallService = inject(PwaInstallService);
  private readonly themeService = inject(ThemeService);
  private readonly tourService = inject(TourService);
  private readonly destroy$ = new Subject<void>();

  nombreUsuario: string | null = null;
  currentUser: Usuario | null = null;
  isLoggedIn = false;
  canInstallPwa = false;
  showIosInstallHelp = false;
  notificationsEnabled = false;
  isMobileDevice = this.getIsMobileDevice();
  showSplash = true;
  currentUrl = this.router.url;
  sosSosteniendo = false;
  private sosHoldTimeoutId?: ReturnType<typeof setTimeout>;

  @HostListener('window:resize')
  onWindowResize(): void {
    this.isMobileDevice = this.getIsMobileDevice();
    this.showIosInstallHelp = this.isMobileDevice && this.pwaInstallService.isIosSafari();
  }

  constructor() {
    addIcons({alertCircle,notifications,notificationsOutline,calendar,people,person,personCircle,logOut,download,statsChart,chatbubbleEllipses,helpCircleOutline,moonOutline,sunnyOutline});
    void this.clearDevelopmentServiceWorkers();
    window.setTimeout(() => {
      this.showSplash = false;
    }, 900);

    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        this.isLoggedIn = !!user;
        this.nombreUsuario = user?.nombre || null;
        this.tourService.iniciarSiEsNuevo(user);
      });

    this.pwaInstallService.canInstall$
      .pipe(takeUntil(this.destroy$))
      .subscribe(canInstall => {
        this.canInstallPwa = canInstall;
      });

    this.showIosInstallHelp = this.isMobileDevice && this.pwaInstallService.isIosSafari();

    this.localNotificationService.notificationsEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => {
        this.notificationsEnabled = enabled;
      });

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(event => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  get temaOscuro(): boolean {
    return this.themeService.getPreference() === 'dark';
  }

  alternarTema(): void {
    this.themeService.toggle();
  }

  isActive(path: string): boolean {
    return this.currentUrl === path || this.currentUrl.startsWith(`${path}/`);
  }

  ngOnDestroy(): void {
    this.cancelarSostenidoSos();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.authService.logout());
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }

  // Mantener presionado ~1.4s (en vez de un solo toque) es la fricción
  // intencional antes de abrir el formulario de la alerta: hace falta un
  // gesto deliberado, sostenido, que un toque accidental (rozar el botón al
  // hacer scroll, un bolsillo) no puede replicar. El diálogo de "¿Estás
  // seguro?" que había antes quedaba redundante con ese mismo propósito —
  // se quita para no sumar un paso más sin valor real sobre un botón de
  // emergencia, donde cada segundo cuenta.
  private static readonly SOS_HOLD_MS = 1400;

  iniciarSostenidoSos(): void {
    if (this.sosSosteniendo || !this.currentUser?.comunidadId) {
      return;
    }

    this.sosSosteniendo = true;
    this.sosHoldTimeoutId = setTimeout(() => {
      this.sosSosteniendo = false;
      void this.abrirFormularioAlerta();
    }, AppComponent.SOS_HOLD_MS);
  }

  cancelarSostenidoSos(): void {
    this.sosSosteniendo = false;
    if (this.sosHoldTimeoutId) {
      clearTimeout(this.sosHoldTimeoutId);
      this.sosHoldTimeoutId = undefined;
    }
  }

  private async abrirFormularioAlerta(): Promise<void> {
    // El GPS empieza a buscar mientras el usuario elige el tipo, para que al
    // enviar ya esté listo (o se descarte solo tras unos segundos).
    const posicion = obtenerPosicion();

    const form = await this.alertCtrl.create({
      header: 'Tipo de emergencia',
      subHeader: 'Se enviará tu ubicación, torre y apartamento.',
      inputs: TIPOS_ALERTA_SOS.map((tipo, index) => ({
        type: 'radio' as const,
        label: tipo,
        value: tipo,
        checked: index === 0,
      })),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar alerta',
          handler: tipo => this.enviarAlertaSos(tipo as string, posicion),
        },
      ],
    });

    await form.present();
  }

  private async enviarAlertaSos(tipo: string | undefined, posicionPendiente: ReturnType<typeof obtenerPosicion>): Promise<boolean> {
    if (!tipo) {
      const warning = await this.alertCtrl.create({
        header: 'Elige un tipo',
        message: 'Selecciona el tipo de emergencia para enviar la alerta.',
        buttons: ['OK'],
      });
      await warning.present();
      return false;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.comunidadId) {
      const errorAlert = await this.alertCtrl.create({
        header: 'Error',
        message: 'No se pudo determinar la comunidad.',
        buttons: ['OK'],
      });
      await errorAlert.present();
      return false;
    }

    try {
      const [posicion, comunidad] = await Promise.all([
        posicionPendiente,
        firstValueFrom(this.firestoreService.getComunidadById(currentUser.comunidadId)).catch(() => null),
      ]);
      const unidad = formatearUnidad(currentUser, comunidad?.tipoComunidad === 'casas');

      const avisoData: Omit<Aviso, 'idAviso'> = {
        tituloAviso: 'Alerta SOS',
        descripcionAviso: tipo,
        tipoAviso: 'alerta',
        fechaPublicacion: new Date().toISOString(),
        imagen: 'assets/sirena-alerta.webp',
        autorId: currentUser.idUsuario || '',
        autorNombre: currentUser.nombre,
        comunidadId: currentUser.comunidadId,
        estado: 'pendiente',
        ...(unidad ? { ubicacionAviso: unidad } : {}),
        ...(posicion ? { latitud: posicion.latitud, longitud: posicion.longitud, precisionMetros: posicion.precisionMetros } : {}),
      };

      await firstValueFrom(this.firestoreService.addAviso(avisoData));

      const ok = await this.alertCtrl.create({
        header: 'Alerta SOS enviada correctamente.',
        message: posicion
          ? 'Tu comunidad fue notificada con tu ubicación.'
          : 'Tu comunidad fue notificada. No se pudo obtener tu ubicación GPS (revisa el permiso del navegador).',
        buttons: ['OK'],
      });
      await ok.present();
      return true;
    } catch (error) {
      console.error('Error al generar la alerta SOS:', error);
      const errAlert = await this.alertCtrl.create({
        header: 'Error',
        message: 'No se pudo enviar la alerta. Revisa tu conexión.',
        buttons: ['OK'],
      });
      await errAlert.present();
      return false;
    }
  }

  goToAlertasyEventos(){
    this.navigateTo('/alertas-eventos');
  }

  goToGestionAvisos(){
    this.navigateTo('/gestion-avisos');
  }

  goToRecordatorios(){
    this.navigateTo('/recordatorios');
  }

  goToPerfilUsuario(){
    this.navigateTo('/perfil-usuario');
  }

  goToMensajes(){
    this.navigateTo('/mensajes');
  }

  goToGuiaUso(){
    this.navigateTo('/guia-uso');
  }

  goToUnirseVecindad(){
    this.navigateTo('/unirse-vecindad');
  }

    goToGestionUsuarios(){
    this.navigateTo('/gestion-usuarios');
  }

  goToEstadisticas(){
    this.navigateTo('/estadisticas');
  }

  async installPwa(): Promise<void> {
    if (this.showIosInstallHelp) {
      const alert = await this.alertCtrl.create({
        header: 'Instalar AlertBxt',
        message: 'En iPhone, abre el botón Compartir de Safari y selecciona «Agregar a pantalla de inicio».',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const result = await this.pwaInstallService.install();
    if (result === 'unavailable') {
      const alert = await this.alertCtrl.create({
        header: 'Instalación no disponible',
        message: 'Si ya está instalada, abre AlertBxt desde el ícono de tu pantalla de inicio. Si no aparece la opción, prueba desde Chrome o Edge.',
        buttons: ['OK'],
      });
      await alert.present();
    }
  }

  async enableNotifications(): Promise<void> {
    const result = await this.localNotificationService.enableNotifications();

    if (result === 'granted' && this.currentUser) {
      void this.fcmService.iniciarParaUsuario(this.currentUser);
    }

    const message = result === 'granted'
      ? 'Las notificaciones quedaron activadas para este dispositivo.'
      : result === 'denied'
        ? 'El navegador bloqueó las notificaciones. Actívalas desde la configuración del sitio.'
        : 'Este navegador no soporta notificaciones web.';

    const alert = await this.alertCtrl.create({
      header: 'Notificaciones',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async navigateTo(path: string): Promise<void> {
    await this.menuController.close('main-menu').catch(() => undefined);
    await this.ngZone.run(() => this.router.navigateByUrl(path));
  }

  private async clearDevelopmentServiceWorkers(): Promise<void> {
    if (!isDevMode() || !('serviceWorker' in navigator)) {
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }

  private getIsMobileDevice(): boolean {
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  }
}
