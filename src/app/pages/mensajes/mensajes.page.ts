import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, paperPlaneOutline } from 'ionicons/icons';
import { Subject, filter, switchMap, takeUntil } from 'rxjs';
import { MensajeAdmin, MensajeEnviado, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { MensajesService } from '../../services/mensajes.service';

type Vista = 'recibidos' | 'enviados';

@Component({
  selector: 'app-mensajes',
  templateUrl: './mensajes.page.html',
  styleUrls: ['./mensajes.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
})
export class MensajesPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly mensajesService = inject(MensajesService);
  private readonly destroy$ = new Subject<void>();

  usuario: Usuario | null = null;
  vista: Vista = 'recibidos';

  mensajesRecibidos: MensajeAdmin[] = [];
  mensajesEnviados: MensajeEnviado[] = [];
  isLoading = true;
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  get esAdmin(): boolean {
    return this.usuario?.rol === 'admin';
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
  }

  formatearDestinatarios(mensaje: MensajeEnviado): string {
    const nombres = mensaje.destinatarios.map(d => d.nombre);
    if (nombres.length <= 2) {
      return nombres.join(' y ');
    }
    return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
  }
}
