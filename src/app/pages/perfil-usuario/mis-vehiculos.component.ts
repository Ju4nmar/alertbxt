import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonIcon, IonInput, IonItem, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { carOutline, trashOutline } from 'ionicons/icons';
import { Subject, firstValueFrom, switchMap, takeUntil } from 'rxjs';
import { TipoVehiculo, Usuario, Vehiculo } from '../../models';
import { FirestoreService } from '../../services/firestore.service';
import { esPlacaValida, normalizarPlaca } from '../../utils/placa.utils';

export const MAX_VEHICULOS_POR_VECINO = 4;

@Component({
  selector: 'app-mis-vehiculos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, IonButton, IonIcon, IonInput, IonItem, IonSelect, IonSelectOption],
  template: `
    <h3>Mis vehículos</h3>
    <p class="vehiculos-sub">Registra tus placas para que el guarda y el administrador puedan identificar tu vehículo.</p>

    <p *ngIf="!cargando && !vehiculos.length" class="empty-text">Aún no has registrado vehículos.</p>

    <ul class="vehiculos-lista" *ngIf="vehiculos.length">
      <li *ngFor="let vehiculo of vehiculos; trackBy: trackById">
        <ion-icon name="car-outline"></ion-icon>
        <div class="vehiculo-datos">
          <strong>{{ vehiculo.placa }}</strong>
          <span>{{ etiquetaTipo(vehiculo.tipo) }}<ng-container *ngIf="vehiculo.marca"> · {{ vehiculo.marca }}</ng-container><ng-container *ngIf="vehiculo.color"> · {{ vehiculo.color }}</ng-container></span>
        </div>
        <button type="button" class="vehiculo-quitar" (click)="quitar(vehiculo)" [attr.aria-label]="'Eliminar vehículo ' + vehiculo.placa">
          <ion-icon name="trash-outline"></ion-icon>
        </button>
      </li>
    </ul>

    <form *ngIf="vehiculos.length < maximo" class="vehiculos-form" (ngSubmit)="agregar()" novalidate>
      <ion-item>
        <ion-input label="Placa" label-placement="floating" [(ngModel)]="placa" name="placa" maxlength="8" placeholder="ABC123" autocapitalize="characters" (ionInput)="error = ''"></ion-input>
      </ion-item>
      <ion-item>
        <ion-select label="Tipo" label-placement="floating" [(ngModel)]="tipo" name="tipo" interface="popover">
          <ion-select-option value="carro">Carro</ion-select-option>
          <ion-select-option value="moto">Moto</ion-select-option>
          <ion-select-option value="otro">Otro</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-input label="Marca (opcional)" label-placement="floating" [(ngModel)]="marca" name="marca" maxlength="30"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Color (opcional)" label-placement="floating" [(ngModel)]="color" name="color" maxlength="20"></ion-input>
      </ion-item>
      <div *ngIf="error" class="field-error" role="alert">{{ error }}</div>
      <ion-button type="submit" class="save-btn" [disabled]="guardando">
        {{ guardando ? 'Guardando...' : 'Agregar vehículo' }}
      </ion-button>
    </form>
    <p *ngIf="vehiculos.length >= maximo" class="field-hint">Llegaste al máximo de {{ maximo }} vehículos. Elimina uno para registrar otro.</p>
  `,
  styles: [`
    .vehiculos-sub { margin: 0 0 12px; color: var(--ab-text-secondary); font-size: 0.9rem; }
    .vehiculos-lista { margin: 0 0 14px; padding: 0; list-style: none; }
    .vehiculos-lista li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--ab-border); }
    .vehiculos-lista li:first-child { border-top: 0; }
    .vehiculos-lista ion-icon { font-size: 1.5rem; color: var(--ion-color-primary); }
    .vehiculo-datos { display: flex; flex: 1; flex-direction: column; color: var(--ab-text-primary); }
    .vehiculo-datos span { font-size: 0.85rem; color: var(--ab-text-secondary); }
    .vehiculo-quitar { background: none; border: 0; cursor: pointer; color: var(--ion-color-danger); }
    .vehiculos-form { display: flex; flex-direction: column; gap: 8px; }
  `],
})
export class MisVehiculosComponent implements OnChanges, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly usuario$ = new Subject<Usuario>();
  private readonly destroy$ = new Subject<void>();
  private suscrito = false;

  @Input({ required: true }) usuario!: Usuario;
  // Torre/apartamento tal como están en el formulario de perfil de hoy.

  readonly maximo = MAX_VEHICULOS_POR_VECINO;
  vehiculos: Vehiculo[] = [];
  cargando = true;
  guardando = false;
  error = '';
  placa = '';
  tipo: TipoVehiculo = 'carro';
  marca = '';
  color = '';

  constructor() {
    addIcons({ carOutline, trashOutline });
  }

  ngOnChanges(): void {
    if (!this.suscrito) {
      this.suscrito = true;
      this.usuario$.pipe(
        switchMap(usuario => this.firestoreService.getVehiculosDeUsuario(usuario.idUsuario || '', usuario.comunidadId)),
        takeUntil(this.destroy$)
      ).subscribe({
        next: vehiculos => {
          this.vehiculos = vehiculos;
          this.cargando = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.cargando = false;
          this.error = 'No se pudieron cargar tus vehículos.';
          this.cdr.markForCheck();
        },
      });
    }
    if (this.usuario?.idUsuario && this.usuario.comunidadId) {
      this.usuario$.next(this.usuario);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  etiquetaTipo(tipo: TipoVehiculo): string {
    return tipo === 'carro' ? 'Carro' : tipo === 'moto' ? 'Moto' : 'Otro';
  }

  trackById(_: number, vehiculo: Vehiculo): string {
    return vehiculo.idVehiculo || vehiculo.placa;
  }

  async agregar(): Promise<void> {
    if (this.guardando) {
      return;
    }
    const placa = normalizarPlaca(this.placa);
    if (!esPlacaValida(placa)) {
      this.error = 'Escribe una placa válida (5 a 7 letras o números).';
      return;
    }

    this.guardando = true;
    this.error = '';
    try {
      await firstValueFrom(this.firestoreService.addVehiculo({
        placa,
        tipo: this.tipo,
        marca: this.marca.trim() || undefined,
        color: this.color.trim() || undefined,
        propietarioId: this.usuario.idUsuario || '',
        propietarioNombre: this.usuario.nombre,
        torre: this.usuario.torre || undefined,
        apartamento: this.usuario.numeroApartamento || undefined,
        comunidadId: this.usuario.comunidadId,
      }));
      this.placa = '';
      this.marca = '';
      this.color = '';
      this.tipo = 'carro';
    } catch (error) {
      const codigo = (error as { code?: string }).code;
      // Sin update en las reglas, registrar una placa que ya existe se rechaza.
      this.error = codigo === 'permission-denied'
        ? 'Esa placa ya está registrada en tu vecindad.'
        : 'No se pudo guardar el vehículo. Intenta de nuevo.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async quitar(vehiculo: Vehiculo): Promise<void> {
    if (!vehiculo.idVehiculo) {
      return;
    }
    try {
      await firstValueFrom(this.firestoreService.deleteVehiculo(vehiculo.idVehiculo));
    } catch {
      this.error = 'No se pudo eliminar el vehículo.';
      this.cdr.markForCheck();
    }
  }
}
