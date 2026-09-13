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

interface DonutSegmento {
  etiqueta: string;
  valor: number;
  color: string;
  dasharray: string;
  dashoffset: string;
}

const RESUMEN_VACIO: EstadisticasResumen = {
  usuarios: { total: 0, activos: 0, inactivos: 0, admins: 0, residentes: 0 },
  avisos: { total: 0, emergencia: 0, mantenimiento: 0, informativo: 0, alertaSos: 0 },
  recordatorios: { total: 0, completados: 0, pendientes: 0 },
};

const DONUT_RADIO = 42;
const DONUT_CIRCUNFERENCIA = 2 * Math.PI * DONUT_RADIO;

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

  readonly donutRadio = DONUT_RADIO;
  readonly donutCircunferencia = DONUT_CIRCUNFERENCIA;

  resumen: EstadisticasResumen = RESUMEN_VACIO;
  donutVecinos: DonutSegmento[] = [];
  donutAvisos: DonutSegmento[] = [];
  donutRecordatorios: DonutSegmento[] = [];
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
      this.donutVecinos = this.construirDona([
        { etiqueta: 'Activos', valor: this.resumen.usuarios.activos, color: 'var(--ion-color-success)' },
        { etiqueta: 'Inactivos', valor: this.resumen.usuarios.inactivos, color: 'var(--ion-color-medium)' },
      ]);
      this.donutAvisos = this.construirDona([
        { etiqueta: 'Alertas SOS', valor: this.resumen.avisos.alertaSos, color: 'var(--ion-color-secondary)' },
        { etiqueta: 'Emergencia', valor: this.resumen.avisos.emergencia, color: 'var(--ion-color-danger)' },
        { etiqueta: 'Mantenimiento', valor: this.resumen.avisos.mantenimiento, color: 'var(--ion-color-warning)' },
        { etiqueta: 'Informativo', valor: this.resumen.avisos.informativo, color: 'var(--ion-color-primary)' },
      ]);
      this.donutRecordatorios = this.construirDona([
        { etiqueta: 'Completados', valor: this.resumen.recordatorios.completados, color: 'var(--ion-color-success)' },
        { etiqueta: 'Pendientes', valor: this.resumen.recordatorios.pendientes, color: 'var(--ion-color-medium)' },
      ]);
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

  private construirDona(valores: { etiqueta: string; valor: number; color: string }[]): DonutSegmento[] {
    const total = valores.reduce((suma, v) => suma + v.valor, 0);
    if (total === 0) {
      return [];
    }

    let acumulado = 0;
    return valores
      .filter(v => v.valor > 0)
      .map(v => {
        const fraccion = v.valor / total;
        const largo = fraccion * DONUT_CIRCUNFERENCIA;
        const segmento: DonutSegmento = {
          etiqueta: v.etiqueta,
          valor: v.valor,
          color: v.color,
          dasharray: `${largo} ${DONUT_CIRCUNFERENCIA - largo}`,
          dashoffset: `${-acumulado * DONUT_CIRCUNFERENCIA}`,
        };
        acumulado += fraccion;
        return segmento;
      });
  }
}
