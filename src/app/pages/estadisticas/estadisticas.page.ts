import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { Subject, catchError, combineLatest, filter, of, switchMap, takeUntil } from 'rxjs';
import { Aviso, Recordatorio, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

interface EstadisticasResumen {
  usuarios: {
    total: number;
    activos: number;
    inactivos: number;
    admins: number;
    residentes: number;
  };
  avisos: {
    total: number;
    emergencia: number;
    mantenimiento: number;
    informativo: number;
    alertaSos: number;
  };
  recordatorios: {
    total: number;
    completados: number;
    pendientes: number;
  };
}

const RESUMEN_VACIO: EstadisticasResumen = {
  usuarios: { total: 0, activos: 0, inactivos: 0, admins: 0, residentes: 0 },
  avisos: { total: 0, emergencia: 0, mantenimiento: 0, informativo: 0, alertaSos: 0 },
  recordatorios: { total: 0, completados: 0, pendientes: 0 },
};

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule],
})
export class EstadisticasPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly destroy$ = new Subject<void>();

  resumen: EstadisticasResumen = RESUMEN_VACIO;
  isLoading = true;
  cargaError = '';

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId && user?.rol === 'admin'),
      switchMap(user => combineLatest([
        this.firestoreService.getUsuariosByComunidad(user.comunidadId),
        this.firestoreService.getAvisosByComunidad(user.comunidadId),
        this.firestoreService.getRecordatoriosByComunidad(user.comunidadId),
      ])),
      catchError(error => {
        console.error('Error cargando estadísticas:', error);
        this.cargaError = 'No se pudieron cargar las estadísticas. Revisa tu conexión e intenta de nuevo.';
        this.isLoading = false;
        return of(null);
      }),
      takeUntil(this.destroy$)
    ).subscribe(datos => {
      if (!datos) {
        return;
      }

      const [usuarios, avisos, recordatorios] = datos;
      this.resumen = this.calcularResumen(usuarios, avisos, recordatorios);
      this.isLoading = false;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private calcularResumen(usuarios: Usuario[], avisos: Aviso[], recordatorios: Recordatorio[]): EstadisticasResumen {
    return {
      usuarios: {
        total: usuarios.length,
        activos: usuarios.filter(u => u.activo !== false).length,
        inactivos: usuarios.filter(u => u.activo === false).length,
        admins: usuarios.filter(u => u.rol === 'admin').length,
        residentes: usuarios.filter(u => u.rol === 'residente').length,
      },
      avisos: {
        total: avisos.length,
        emergencia: avisos.filter(a => a.tipoAviso === 'emergencia').length,
        mantenimiento: avisos.filter(a => a.tipoAviso === 'mantenimiento').length,
        informativo: avisos.filter(a => a.tipoAviso === 'informativo').length,
        alertaSos: avisos.filter(a => a.tipoAviso === 'alerta').length,
      },
      recordatorios: {
        total: recordatorios.length,
        completados: recordatorios.filter(r => r.estado === 'completado').length,
        pendientes: recordatorios.filter(r => r.estado !== 'completado').length,
      },
    };
  }
}
