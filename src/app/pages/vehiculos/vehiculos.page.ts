import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { carOutline, personOutline, searchOutline } from 'ionicons/icons';
import { Subject, distinctUntilChanged, filter, switchMap, takeUntil } from 'rxjs';
import { Usuario, Vehiculo } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { normalizarPlaca } from '../../utils/placa.utils';

// Consulta para administrador y guarda: de quién es cada vehículo de la
// comunidad (los vecinos registran los suyos desde su Perfil).
@Component({
  selector: 'app-vehiculos',
  templateUrl: './vehiculos.page.html',
  styleUrls: ['./vehiculos.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
})
export class VehiculosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  constructor() {
    addIcons({ carOutline, personOutline, searchOutline });
  }

  vehiculos: Vehiculo[] = [];
  busqueda = '';
  isLoading = true;
  cargaError = '';

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId),
      distinctUntilChanged((previous, current) => previous.comunidadId === current.comunidadId),
      switchMap(user => this.firestoreService.getVehiculosDeComunidad(user.comunidadId)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: vehiculos => {
        this.vehiculos = vehiculos;
        this.cargaError = '';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        console.error('Error cargando vehículos:', error);
        this.cargaError = 'No se pudieron cargar los vehículos. Revisa tu conexión e intenta de nuevo.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Coincide por placa (sin importar espacios o guiones), dueño, torre o apartamento.
  get resultados(): Vehiculo[] {
    const texto = this.busqueda.trim().toLowerCase();
    const placa = normalizarPlaca(this.busqueda);
    if (!texto) {
      return this.vehiculos;
    }
    return this.vehiculos.filter(vehiculo =>
      (placa && vehiculo.placa.includes(placa))
      || vehiculo.propietarioNombre.toLowerCase().includes(texto)
      || (vehiculo.torre ?? '').toLowerCase().includes(texto)
      || (vehiculo.apartamento ?? '').toLowerCase().includes(texto)
    );
  }

  etiquetaTipo(tipo: string): string {
    return tipo === 'carro' ? 'Carro' : tipo === 'moto' ? 'Moto' : 'Otro';
  }

  trackById(_: number, vehiculo: Vehiculo): string {
    return vehiculo.idVehiculo || vehiculo.placa;
  }
}
