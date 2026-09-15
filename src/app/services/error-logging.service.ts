import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, addDoc, collection } from '@angular/fire/firestore';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ErrorLoggingService {
  private readonly injector = inject(Injector);
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);

  // Evita saturar Firestore si un mismo error se repite en un loop de change
  // detection: se ignoran repeticiones del mismo mensaje dentro de esta ventana.
  private readonly ventanaDeduplicacionMs = 5000;
  private ultimoMensaje = '';
  private ultimoRegistroTs = 0;

  registrarError(error: unknown): void {
    const mensaje = this.obtenerMensaje(error);
    const ahora = Date.now();
    if (mensaje === this.ultimoMensaje && ahora - this.ultimoRegistroTs < this.ventanaDeduplicacionMs) {
      return;
    }
    this.ultimoMensaje = mensaje;
    this.ultimoRegistroTs = ahora;

    // Las reglas de Firestore exigen que "uid" coincida con request.auth.uid,
    // así que se toma del propio Auth SDK y no del documento de Usuario (que
    // puede no estar cargado aún en AuthService al momento del error).
    const uid = this.auth.currentUser?.uid ?? null;
    const usuario = this.authService.getCurrentUser();
    const registro = {
      mensaje,
      stack: this.obtenerStack(error),
      ruta: window.location.pathname,
      uid,
      comunidadId: usuario?.comunidadId ?? null,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    try {
      const col = runInInjectionContext(this.injector, () => collection(this.firestore, 'logs_errores'));
      runInInjectionContext(this.injector, () => addDoc(col, registro)).catch(() => {
        // Si falla el propio registro (sin conexión, reglas, etc.) no hay nada
        // más que hacer: no debe interrumpir ni reintentar en bucle.
      });
    } catch {
      // Firestore puede no estar disponible en un contexto muy temprano del
      // arranque; se ignora silenciosamente.
    }
  }

  private obtenerMensaje(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }
    return String(error);
  }

  private obtenerStack(error: unknown): string {
    const stack = error instanceof Error ? error.stack : undefined;
    return (stack ?? '').slice(0, 2000);
  }
}
