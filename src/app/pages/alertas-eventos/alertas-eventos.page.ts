import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { Subject, catchError, combineLatest, distinctUntilChanged, filter, forkJoin, map, of, switchMap, takeUntil } from 'rxjs';
import { Aviso, Recordatorio } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

interface PanelCard {
  tipo: 'aviso' | 'recordatorio';
  id: string;
  fecha: string;
  aviso?: Aviso;
  recordatorio?: Recordatorio;
}

interface ModalData {
  variant: 'aviso' | 'recordatorio';
  titulo: string;
  descripcion: string;
  fecha?: string;
  tipo?: string;
  autor?: string;
  imagen?: string;
}

@Component({
  selector: 'app-alertas-eventos',
  templateUrl: './alertas-eventos.page.html',
  styleUrls: ['./alertas-eventos.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton],
})
export class AlertasEventosPage implements OnInit, OnDestroy {
  private readonly firestoreService = inject(FirestoreService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  avisos: Aviso[] = [];
  recordatorios: Recordatorio[] = [];
  tarjetas: PanelCard[] = [];
  gruposTarjetas: PanelCard[][] = [];
  currentPage = 0;
  modalAbierto = false;
  modalData: ModalData | null = null;
  isLoading = false;
  private cardsPerPage = this.getCardsPerPage();
  private touchStartX = 0;
  private touchStartY = 0;

  @HostListener('window:resize')
  onResize(): void {
    const nextCardsPerPage = this.getCardsPerPage();
    if (nextCardsPerPage !== this.cardsPerPage) {
      this.cardsPerPage = nextCardsPerPage;
      this.currentPage = 0;
      this.agruparTarjetas();
    }
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      filter(user => !!user?.comunidadId && !!user?.idUsuario),
      distinctUntilChanged((previous, current) =>
        previous?.comunidadId === current?.comunidadId && previous?.idUsuario === current?.idUsuario
      ),
      switchMap(user => combineLatest([
        this.firestoreService.getAvisosByComunidad(user!.comunidadId).pipe(
          switchMap(avisos => this.completarAutores(avisos)),
          catchError(error => {
            console.error('Error cargando avisos:', error);
            return of([]);
          })
        ),
        this.firestoreService.getRecordatoriosByUsuario(user!.idUsuario || '').pipe(
          catchError(error => {
            console.error('Error cargando recordatorios:', error);
            return of([]);
          })
        ),
      ])),
      takeUntil(this.destroy$)
    ).subscribe({
      next: ([avisos, recordatorios]) => {
        this.avisos = avisos;
        this.recordatorios = recordatorios;
        this.tarjetas = this.crearTarjetas(avisos, recordatorios);
        this.currentPage = 0;
        this.agruparTarjetas();
        this.cdr.markForCheck();
      },
      error: error => {
        console.error('Error cargando avisos:', error);
      },
    });

    this.firestoreService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  agruparTarjetas(): void {
    const grupos: PanelCard[][] = [];
    for (let i = 0; i < this.tarjetas.length; i += this.cardsPerPage) {
      grupos.push(this.tarjetas.slice(i, i + this.cardsPerPage));
    }
    this.gruposTarjetas = grupos;
  }

  private getCardsPerPage(): number {
    if (window.innerWidth <= 768) {
      return 1;
    }

    if (window.innerWidth <= 1100) {
      return 2;
    }

    return 3;
  }

  private completarAutores(avisos: Aviso[]) {
    const avisosSinAutor = avisos.filter(aviso => aviso.autorId && !aviso.autorNombre);

    if (!avisosSinAutor.length) {
      return of(avisos);
    }

    const autoresUnicos = Array.from(new Set(avisosSinAutor.map(aviso => aviso.autorId)));
    const consultasAutores = autoresUnicos.map(autorId =>
      this.firestoreService.getUsuarioById(autorId).pipe(
        map(usuario => [autorId, usuario?.nombre || autorId] as const)
      )
    );

    return forkJoin(consultasAutores).pipe(
      map(autores => {
        const autoresMap = new Map(autores);
        return avisos.map(aviso => ({
          ...aviso,
          autorNombre: aviso.autorNombre || autoresMap.get(aviso.autorId) || aviso.autorId,
        }));
      })
    );
  }

  private crearTarjetas(avisos: Aviso[], recordatorios: Recordatorio[]): PanelCard[] {
    const tarjetasAvisos: PanelCard[] = avisos.map(aviso => ({
      tipo: 'aviso',
      id: aviso.idAviso || `aviso-${aviso.fechaPublicacion}-${aviso.tituloAviso}`,
      aviso,
      fecha: aviso.fechaPublicacion || '',
    }));

    const tarjetasRecordatorios: PanelCard[] = recordatorios.map(recordatorio => ({
      tipo: 'recordatorio',
      id: recordatorio.idRecordatorios || `recordatorio-${recordatorio.fechaHora}-${recordatorio.tituloRecordatorio}`,
      recordatorio,
      fecha: recordatorio.fechaHora,
    }));

    return [...tarjetasAvisos, ...tarjetasRecordatorios].sort((a, b) =>
      this.getTimestamp(b.fecha) - this.getTimestamp(a.fecha)
    );
  }

  private getTimestamp(fecha: string): number {
    const timestamp = new Date(fecha).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  cambiarPagina(index: number): void {
    this.currentPage = Math.max(0, Math.min(index, this.gruposTarjetas.length - 1));
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    this.cambiarPagina(deltaX < 0 ? this.currentPage + 1 : this.currentPage - 1);
  }

  abrirModal(tarjeta: PanelCard): void {
    if (tarjeta.tipo === 'aviso' && tarjeta.aviso) {
      this.modalData = {
        variant: 'aviso',
        titulo: tarjeta.aviso.tituloAviso || 'Sin titulo',
        descripcion: tarjeta.aviso.descripcionAviso || 'Sin descripcion',
        fecha: tarjeta.aviso.fechaPublicacion,
        tipo: tarjeta.aviso.tipoAviso,
        autor: tarjeta.aviso.autorNombre || tarjeta.aviso.autorId || 'Autor no disponible',
        imagen: tarjeta.aviso.imagen,
      };
    } else if (tarjeta.tipo === 'recordatorio' && tarjeta.recordatorio) {
      this.modalData = {
        variant: 'recordatorio',
        titulo: tarjeta.recordatorio.tituloRecordatorio || 'Recordatorio',
        descripcion: tarjeta.recordatorio.descripcionRecordatorio || 'Sin descripcion',
        fecha: tarjeta.recordatorio.fechaHora,
      };
    } else {
      return;
    }

    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.modalData = null;
  }

  onModalBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cerrarModal();
    }
  }

  onModalPresent(): void {
    this.cdr.markForCheck();
  }

  isPriorityImage(groupIndex: number, cardIndex: number): boolean {
    return groupIndex === 0 && cardIndex < this.cardsPerPage;
  }

  isReminderCompleted(recordatorio: Recordatorio | undefined): boolean {
    if (!recordatorio) return false;
    if (recordatorio.estado === 'completado') return true;
    const reminderTime = new Date(recordatorio.fechaHora).getTime();
    return reminderTime < Date.now();
  }

  trackByCardId(_: number, tarjeta: PanelCard): string {
    return tarjeta.id;
  }

  trackByGroupIndex(index: number): number {
    return index;
  }

}
