import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline } from 'ionicons/icons';
import { Subject, filter, switchMap, takeUntil } from 'rxjs';
import { MensajeAdmin } from '../../models';
import { AuthService } from '../../services/auth.service';
import { MensajesService } from '../../services/mensajes.service';

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

  mensajes: MensajeAdmin[] = [];
  isLoading = true;
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  constructor() {
    addIcons({ chatbubbleEllipsesOutline });
  }

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(
        filter(user => !!user?.idUsuario),
        switchMap(user => this.mensajesService.getMensajesByUsuario(user!.idUsuario!)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: mensajes => {
          this.mensajes = mensajes;
          this.isLoading = false;
        },
        error: error => {
          console.error('Error cargando mensajes:', error);
          this.isLoading = false;
          this.cargaError = 'No se pudieron cargar los mensajes. Revisa tu conexión e intenta de nuevo.';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
