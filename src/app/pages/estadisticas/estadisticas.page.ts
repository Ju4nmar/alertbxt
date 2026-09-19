import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { Subject, catchError, combineLatest, filter, of, switchMap, takeUntil } from 'rxjs';
import { ContadorDirective } from '../../directives/contador.directive';
import { Aviso, Recordatorio, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

type Periodo = '7d' | '30d' | 'todo';

interface Categoria {
  etiqueta: string;
  valor: number;
  color: string;
}

interface DonutSegmento extends Categoria {
  dasharray: string;
  dashoffset: string;
  porcentaje: number;
}

interface Donut {
  clave: 'vecinos' | 'avisos' | 'recordatorios';
  unidad: string;
  vacio: string;
  categorias: Categoria[];
  ocultas: Set<string>;
  resaltada: string | null;
  segmentos: DonutSegmento[];
  total: number;
}

interface Resumen {
  usuarios: { total: number; activos: number; inactivos: number; admins: number; residentes: number };
  avisos: { total: number; emergencia: number; mantenimiento: number; informativo: number; alertaSos: number };
  recordatorios: { total: number; completados: number; pendientes: number };
}

const RESUMEN_VACIO: Resumen = {
  usuarios: { total: 0, activos: 0, inactivos: 0, admins: 0, residentes: 0 },
  avisos: { total: 0, emergencia: 0, mantenimiento: 0, informativo: 0, alertaSos: 0 },
  recordatorios: { total: 0, completados: 0, pendientes: 0 },
};

const DONUT_RADIO = 42;
const DONUT_CIRCUNFERENCIA = 2 * Math.PI * DONUT_RADIO;
const DIA_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, ContadorDirective],
})
export class EstadisticasPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  readonly donutRadio = DONUT_RADIO;
  readonly periodos: { valor: Periodo; etiqueta: string }[] = [
    { valor: '7d', etiqueta: 'Últimos 7 días' },
    { valor: '30d', etiqueta: 'Últimos 30 días' },
    { valor: 'todo', etiqueta: 'Todo' },
  ];

  periodo: Periodo = 'todo';
  resumen: Resumen = RESUMEN_VACIO;
  donuts: Record<Donut['clave'], Donut> = {
    vecinos: this.crearDonut('vecinos', 'vecinos', 'Aún no hay vecinos registrados.'),
    avisos: this.crearDonut('avisos', 'avisos', 'Aún no hay avisos en este período.'),
    recordatorios: this.crearDonut('recordatorios', 'total', 'Aún no hay recordatorios en este período.'),
  };
  isLoading = true;
  cargaError = '';
  readonly skeletonPlaceholders = [1, 2, 3];

  private usuarios: Usuario[] = [];
  private avisos: Aviso[] = [];
  private recordatorios: Recordatorio[] = [];

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is Usuario => !!user?.comunidadId && user?.rol === 'admin'),
      switchMap(user => combineLatest([
        this.firestoreService.getUsuariosByComunidad(user.comunidadId),
        this.firestoreService.getAvisosByComunidad(user.comunidadId),
        this.firestoreService.getRecordatoriosByComunidad(user.comunidadId),
      ]).pipe(
        catchError(error => {
          console.error('Error cargando estadísticas:', error);
          this.cargaError = 'No se pudieron cargar las estadísticas. Revisa tu conexión e intenta de nuevo.';
          this.isLoading = false;
          return of(null);
        })
      )),
      takeUntil(this.destroy$)
    ).subscribe(datos => {
      if (!datos) {
        return;
      }

      [this.usuarios, this.avisos, this.recordatorios] = datos;
      this.recalcular();
      this.isLoading = false;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  elegirPeriodo(periodo: Periodo): void {
    if (periodo !== this.periodo) {
      this.periodo = periodo;
      this.recalcular();
    }
  }

  ir(ruta: string): void {
    void this.router.navigateByUrl(ruta);
  }

  porcentaje(parte: number, total: number): number {
    return total ? Math.round((parte / total) * 100) : 0;
  }

  alternarCategoria(donut: Donut, etiqueta: string): void {
    if (donut.ocultas.has(etiqueta)) {
      donut.ocultas.delete(etiqueta);
    } else {
      donut.ocultas.add(etiqueta);
      if (donut.resaltada === etiqueta) {
        donut.resaltada = null;
      }
    }
    this.construirSegmentos(donut);
  }

  resaltar(donut: Donut, etiqueta: string | null): void {
    donut.resaltada = etiqueta;
  }

  alternarResaltado(donut: Donut, etiqueta: string): void {
    donut.resaltada = donut.resaltada === etiqueta ? null : etiqueta;
  }

  segmentoResaltado(donut: Donut): DonutSegmento | undefined {
    return donut.segmentos.find(segmento => segmento.etiqueta === donut.resaltada);
  }

  totalCategorias(donut: Donut): number {
    return donut.categorias.reduce((suma, categoria) => suma + categoria.valor, 0);
  }

  private crearDonut(clave: Donut['clave'], unidad: string, vacio: string): Donut {
    return { clave, unidad, vacio, categorias: [], ocultas: new Set<string>(), resaltada: null, segmentos: [], total: 0 };
  }

  private dentroDelPeriodo(fecha: string | undefined): boolean {
    if (this.periodo === 'todo') {
      return true;
    }
    const tiempo = new Date(fecha || '').getTime();
    const dias = this.periodo === '7d' ? 7 : 30;
    return !Number.isNaN(tiempo) && Date.now() - tiempo <= dias * DIA_MS;
  }

  private recalcular(): void {
    const avisos = this.avisos.filter(aviso => this.dentroDelPeriodo(aviso.fechaPublicacion));
    const recordatorios = this.recordatorios.filter(r => this.dentroDelPeriodo(r.fechaCreacion || r.fechaHora));

    this.resumen = this.calcularResumen(this.usuarios, avisos, recordatorios);

    this.donuts.vecinos.categorias = [
      { etiqueta: 'Activos', valor: this.resumen.usuarios.activos, color: 'var(--ion-color-success)' },
      { etiqueta: 'Inactivos', valor: this.resumen.usuarios.inactivos, color: 'var(--ion-color-medium)' },
    ];
    this.donuts.avisos.categorias = [
      { etiqueta: 'Alertas SOS', valor: this.resumen.avisos.alertaSos, color: 'var(--ion-color-secondary)' },
      { etiqueta: 'Emergencia', valor: this.resumen.avisos.emergencia, color: 'var(--ion-color-danger)' },
      { etiqueta: 'Mantenimiento', valor: this.resumen.avisos.mantenimiento, color: 'var(--ion-color-warning)' },
      { etiqueta: 'Informativo', valor: this.resumen.avisos.informativo, color: 'var(--ion-color-primary)' },
    ];
    this.donuts.recordatorios.categorias = [
      { etiqueta: 'Completados', valor: this.resumen.recordatorios.completados, color: 'var(--ion-color-success)' },
      { etiqueta: 'Pendientes', valor: this.resumen.recordatorios.pendientes, color: 'var(--ion-color-medium)' },
    ];

    Object.values(this.donuts).forEach(donut => {
      donut.resaltada = null;
      this.construirSegmentos(donut);
    });
  }

  private calcularResumen(usuarios: Usuario[], avisos: Aviso[], recordatorios: Recordatorio[]): Resumen {
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

  private construirSegmentos(donut: Donut): void {
    const visibles = donut.categorias.filter(c => c.valor > 0 && !donut.ocultas.has(c.etiqueta));
    const total = visibles.reduce((suma, c) => suma + c.valor, 0);
    donut.total = total;

    let acumulado = 0;
    donut.segmentos = visibles.map(c => {
      const fraccion = c.valor / total;
      const largo = fraccion * DONUT_CIRCUNFERENCIA;
      const segmento: DonutSegmento = {
        ...c,
        porcentaje: Math.round(fraccion * 100),
        dasharray: `${largo} ${DONUT_CIRCUNFERENCIA - largo}`,
        dashoffset: `${-acumulado * DONUT_CIRCUNFERENCIA}`,
      };
      acumulado += fraccion;
      return segmento;
    });
  }
}
