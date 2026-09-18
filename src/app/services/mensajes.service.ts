import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, catchError, from, map, throwError } from 'rxjs';
import { MensajeAdmin } from '../models';
import { FirestoreService } from './firestore.service';

@Injectable({ providedIn: 'root' })
export class MensajesService {
  private readonly functions = inject(Functions);
  private readonly firestoreService = inject(FirestoreService);

  enviarMensajeIndividual(destinatarioId: string, mensaje: string): Observable<void> {
    const enviarMensaje = httpsCallable<{ destinatarioId: string; mensaje: string }, { mensajeId: string }>(
      this.functions,
      'enviarMensajeIndividual'
    );

    return from(enviarMensaje({ destinatarioId, mensaje })).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error enviando mensaje individual:', error);
        return throwError(() => new Error(this.getMensajeError(error)));
      })
    );
  }

  getMensajesByUsuario(idUsuario: string): Observable<MensajeAdmin[]> {
    return this.firestoreService.getMensajesAdminByUsuario(idUsuario);
  }

  private getMensajeError(error: unknown): string {
    const code = (error as { code?: string })?.code;

    if (code === 'functions/permission-denied') {
      return 'No tienes permisos para enviar este mensaje.';
    }

    if (code === 'functions/not-found') {
      return 'El destinatario no existe.';
    }

    if (code === 'functions/invalid-argument') {
      return (error as { message?: string })?.message || 'Revisa el mensaje e intenta de nuevo.';
    }

    return 'No se pudo enviar el mensaje. Intenta nuevamente.';
  }
}
