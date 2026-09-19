import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, catchError, from, map, throwError } from 'rxjs';
import { MensajeAdmin, MensajeEnviado, RespuestaMensaje } from '../models';
import { FirestoreService } from './firestore.service';

@Injectable({ providedIn: 'root' })
export class MensajesService {
  private readonly functions = inject(Functions);
  private readonly firestoreService = inject(FirestoreService);

  enviarMensajeIndividual(destinatarioIds: string[], mensaje: string): Observable<void> {
    const enviarMensaje = httpsCallable<{ destinatarioIds: string[]; mensaje: string }, { mensajeId: string; enviados: number }>(
      this.functions,
      'enviarMensajeIndividual'
    );

    return from(enviarMensaje({ destinatarioIds, mensaje })).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error enviando mensaje individual:', error);
        return throwError(() => new Error(this.getMensajeError(error)));
      })
    );
  }

  responderMensaje(mensajeId: string, texto: string): Observable<void> {
    const responderMensaje = httpsCallable<{ mensajeId: string; texto: string }, { respuestaId: string }>(
      this.functions,
      'responderMensajeAdmin'
    );

    return from(responderMensaje({ mensajeId, texto })).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error respondiendo mensaje:', error);
        return throwError(() => new Error(this.getMensajeError(error)));
      })
    );
  }

  getMensajesByUsuario(idUsuario: string): Observable<MensajeAdmin[]> {
    return this.firestoreService.getMensajesAdminByUsuario(idUsuario);
  }

  getMensajesEnviados(idUsuario: string): Observable<MensajeEnviado[]> {
    return this.firestoreService.getMensajesEnviadosByUsuario(idUsuario);
  }

  getRespuestas(idUsuarioDueno: string, mensajeId: string): Observable<RespuestaMensaje[]> {
    return this.firestoreService.getRespuestasMensaje(idUsuarioDueno, mensajeId);
  }

  // Los HttpsError que lanzan enviarMensajeIndividual y responderMensajeAdmin
  // ya traen un mensaje en español listo para mostrar (ver functions/src/
  // index.ts); solo se completa con un texto genérico si por algún motivo
  // no llega (p. ej. un error de red antes de llegar a la función).
  private getMensajeError(error: unknown): string {
    const message = (error as { message?: string })?.message;
    return message || 'No se pudo enviar el mensaje. Intenta nuevamente.';
  }
}
