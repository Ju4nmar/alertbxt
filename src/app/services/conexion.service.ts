import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Estado de conexión del dispositivo. Con la persistencia de Firestore la app
// sigue mostrando los datos ya descargados sin red y encola las escrituras,
// pero el usuario debe saber que está sin conexión y que sus cambios se
// enviarán al reconectar.
@Injectable({ providedIn: 'root' })
export class ConexionService implements OnDestroy {
  private readonly enLineaSubject = new BehaviorSubject<boolean>(this.leerEstado());
  readonly enLinea$ = this.enLineaSubject.asObservable();

  private readonly alConectar = () => this.enLineaSubject.next(true);
  private readonly alDesconectar = () => this.enLineaSubject.next(false);

  constructor() {
    window.addEventListener('online', this.alConectar);
    window.addEventListener('offline', this.alDesconectar);
  }

  get enLinea(): boolean {
    return this.enLineaSubject.value;
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.alConectar);
    window.removeEventListener('offline', this.alDesconectar);
  }

  private leerEstado(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }
}
