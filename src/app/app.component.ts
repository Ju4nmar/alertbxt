import { CommonModule } from '@angular/common';
import { Component, HostListener, NgZone, OnDestroy, ViewEncapsulation, inject, isDevMode } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
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
  IonMenuButton,
  IonSplitPane,
  IonToolbar,
  MenuController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircle, calendar, download, logOut, notifications, notificationsOutline, people, person } from 'ionicons/icons';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { Aviso, Usuario } from './models';
import { AuthService } from './services/auth.service';
import { FirestoreService } from './services/firestore.service';
import { LocalNotificationService } from './services/local-notification.service';
import { PwaInstallService } from './services/pwa-install.service';

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
    IonMenuButton,
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
  private readonly pwaInstallService = inject(PwaInstallService);
  private readonly destroy$ = new Subject<void>();

  nombreUsuario: string | null = null;
  currentUser: Usuario | null = null;
  isLoggedIn = false;
  canInstallPwa = false;
  showIosInstallHelp = false;
  notificationsEnabled = false;
  isMobileDevice = this.getIsMobileDevice();
  showSplash = true;
  private notificationStartHandle: number | null = null;

  @HostListener('window:resize')
  onWindowResize(): void {
    this.isMobileDevice = this.getIsMobileDevice();
    this.showIosInstallHelp = this.isMobileDevice && this.pwaInstallService.isIosSafari();
  }

  constructor() {
    addIcons({alertCircle,notifications,notificationsOutline,calendar,people,person,logOut,download});
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

        if (user && this.hasNotificationPermission()) {
          this.scheduleNotificationStart(user);
        } else {
          this.cancelScheduledNotificationStart();
          this.localNotificationService.stop();
        }
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
  }

  ngOnDestroy(): void {
    this.cancelScheduledNotificationStart();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.authService.logout());
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesion:', error);
    }
  }

  async generarAlerta(): Promise<void> {
    const confirm = await this.alertCtrl.create({
      header: 'Generar Alerta SOS',
      message: 'Deseas generar una alerta de emergencia?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Continuar',
          handler: async () => {
            const form = await this.alertCtrl.create({
              header: 'Detalles de la Emergencia',
              inputs: [
                {
                  name: 'descripcion',
                  type: 'textarea',
                  placeholder: 'Describe brevemente lo que ocurre...',
                },
                {
                  name: 'lugar',
                  type: 'text',
                  placeholder: 'Lugar de la emergencia',
                },
              ],
              buttons: [
                { text: 'Cancelar', role: 'cancel' },
                {
                  text: 'Enviar',
                  handler: data => this.enviarAlertaSos(data),
                },
              ],
            });

            await form.present();
          },
        },
      ],
    });

    await confirm.present();
  }

  private async enviarAlertaSos(data: { descripcion?: string; lugar?: string }): Promise<boolean> {
    if (!data?.descripcion?.trim() || !data?.lugar?.trim()) {
      const warning = await this.alertCtrl.create({
        header: 'Datos incompletos',
        message: 'Por favor ingresa descripcion y lugar.',
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
      const avisoData: Omit<Aviso, 'idAviso'> = {
        tituloAviso: 'Alerta SOS',
        descripcionAviso: `${data.descripcion.trim()}\nLugar: ${data.lugar.trim()}`,
        tipoAviso: 'alerta',
        fechaPublicacion: new Date().toISOString(),
        imagen: 'assets/sirena-alerta.webp',
        autorId: currentUser.idUsuario || '',
        autorNombre: currentUser.nombre,
        comunidadId: currentUser.comunidadId,
      };

      await firstValueFrom(this.firestoreService.addAviso(avisoData));

      const ok = await this.alertCtrl.create({
        header: 'Alerta enviada',
        message: 'La alerta SOS ha sido registrada correctamente.',
        buttons: ['OK'],
      });
      await ok.present();
      return true;
    } catch (error) {
      console.error('Error al generar la alerta SOS:', error);
      const errAlert = await this.alertCtrl.create({
        header: 'Error',
        message: 'No se pudo enviar la alerta. Revisa tu conexion.',
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

  goToUnirseVecindad(){
    this.navigateTo('/unirse-vecindad');
  }

    goToGestionUsuarios(){
    this.navigateTo('/gestion-usuarios');
  }
  
  async installPwa(): Promise<void> {
    if (this.showIosInstallHelp) {
      const alert = await this.alertCtrl.create({
        header: 'Instalar AlertBxt',
        message: 'En iPhone abre el boton Compartir de Safari y selecciona Agregar a pantalla de inicio.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const result = await this.pwaInstallService.install();
    if (result === 'unavailable') {
      const alert = await this.alertCtrl.create({
        header: 'Instalacion no disponible',
        message: 'Si ya esta instalada, abre AlertBxt desde el icono de tu pantalla de inicio. Si no aparece la opcion, prueba desde Chrome o Edge.',
        buttons: ['OK'],
      });
      await alert.present();
    }
  }

  async enableNotifications(): Promise<void> {
    const result = await this.localNotificationService.enableNotifications();

    if (result === 'granted' && this.currentUser) {
      this.scheduleNotificationStart(this.currentUser);
    }

    const message = result === 'granted'
      ? 'Las notificaciones quedaron activadas para este dispositivo.'
      : result === 'denied'
        ? 'El navegador bloqueo las notificaciones. Activalas desde la configuracion del sitio.'
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

  private scheduleNotificationStart(user: Usuario): void {
    this.cancelScheduledNotificationStart();
    const start = () => {
      this.notificationStartHandle = null;
      void this.localNotificationService.start(user);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };

    this.notificationStartHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(start, { timeout: 5000 })
      : window.setTimeout(start, 3000);
  }

  private cancelScheduledNotificationStart(): void {
    if (this.notificationStartHandle === null) {
      return;
    }

    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(this.notificationStartHandle);
    } else {
      window.clearTimeout(this.notificationStartHandle);
    }

    this.notificationStartHandle = null;
  }

  private hasNotificationPermission(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
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
