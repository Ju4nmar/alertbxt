import { Component, ViewEncapsulation, AfterViewInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonTitle,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonButton,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  MenuController,
  IonRouterOutlet,
  AlertController,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Firestore, collection, addDoc, serverTimestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [
    IonRouterOutlet,
    CommonModule,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonTitle,
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
export class AppComponent implements AfterViewInit {
  nombreUsuario: string | null = null;
  currentPath = '';

  constructor(
    private router: Router,
    private menu: MenuController,
    private firestore: Firestore,
    private alertCtrl: AlertController
  ) {
    this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        this.currentPath = evt.urlAfterRedirects;
      }
    });
  }

  ngAfterViewInit() {
    this.router.initialNavigation();
    this.nombreUsuario = localStorage.getItem('nombreUsuario');
  }

  async generarAlerta() {
    const confirm = await this.alertCtrl.create({
      header: 'Generar Alerta SOS',
      message: '¿Deseas generar una alerta de emergencia?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Continuar',
          handler: () => true,
        },
      ],
    });

    await confirm.present();
    const { role } = await confirm.onDidDismiss();
    if (role === 'cancel') return;

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
          placeholder: 'Lugar de la emergencia (ej: Bloque A, Parque, etc.)',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar',
          handler: async (data) => {
            if (!data || !data.descripcion || !data.lugar) {
              const warning = await this.alertCtrl.create({
                header: 'Datos incompletos',
                message: 'Por favor ingresa descripción y lugar.',
                buttons: ['OK'],
              });
              await warning.present();
              return false;
            }

            try {
              const ref = collection(this.firestore, 'avisos');
              await addDoc(ref, {
                titulo: '🚨 Alerta SOS',
                descripcion: `${data.descripcion}\n📍 Lugar: ${data.lugar}`,
                tipo: 'alerta', // ahora el tipo correcto
                fecha: new Date().toISOString(),
                imagen: 'assets/sirena-alerta.png', // ✅ ruta correcta dentro de /assets
              });

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
                message: 'No se pudo enviar la alerta. Revisa tu conexión.',
                buttons: ['OK'],
              });
              await errAlert.present();
              return false;
            }
          },
        },
      ],
    });

    await form.present();
  }

  async onMenuItemClick(path: string) {
    try {
      await this.menu.close();
    } catch (e) {
      console.warn('Error cerrando menú (no crítico):', e);
    }
    this.router.navigate([path], { replaceUrl: true }).catch((err) => {
      console.error('Error navegando a', path, err);
    });
  }
}
