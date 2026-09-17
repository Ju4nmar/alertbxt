import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, take, tap } from 'rxjs/operators';
import { Aviso, Comunidad, Dispositivo, Recordatorio, Usuario } from '../models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  private readonly injector = inject(Injector);
  private readonly firestore = inject(Firestore);
  private readonly isLoadingSubject = new BehaviorSubject<boolean>(false);
  public readonly isLoading$ = this.isLoadingSubject.asObservable();

  private inContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }

  getAvisosByComunidad(comunidadId: string): Observable<Aviso[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'avisos');
      return query(
        col,
        where('comunidadId', '==', comunidadId),
        limit(50)
      );
    });

    return this.inContext(() => collectionData(q, { idField: 'idAviso' })).pipe(
      map(data => (data as Array<Aviso & Record<string, unknown>>)
        .map(aviso => this.normalizeAviso(aviso))
        .sort((a, b) => (b.fechaPublicacion || '').localeCompare(a.fechaPublicacion || ''))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo avisos:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar avisos'));
      })
    );
  }

  addAviso(aviso: Omit<Aviso, 'idAviso'>): Observable<string> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() => collection(this.firestore, 'avisos'));

    return from(this.inContext(() => addDoc(col, { ...aviso, fechaPublicacion: new Date().toISOString() }))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error agregando aviso:', error);
        return throwError(() => new Error('Error al agregar aviso'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  updateAviso(id: string, aviso: Partial<Aviso>): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `avisos/${id}`));

    return from(this.inContext(() => updateDoc(docRef, aviso))).pipe(
      catchError(error => {
        console.error('Error actualizando aviso:', error);
        return throwError(() => new Error('Error al actualizar aviso'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  deleteAviso(id: string): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `avisos/${id}`));

    return from(this.inContext(() => deleteDoc(docRef))).pipe(
      catchError(error => {
        console.error('Error eliminando aviso:', error);
        return throwError(() => new Error('Error al eliminar aviso'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  getUsuariosByComunidad(comunidadId: string): Observable<Usuario[]> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() =>
      query(
        collection(this.firestore, 'usuarios'),
        where('comunidadId', '==', comunidadId)
      )
    );

    return this.inContext(() => collectionData(col)).pipe(
      map(data => (data as Usuario[]).map(usuario => this.normalizeUsuario(usuario))),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo usuarios por comunidad:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar usuarios'));
      })
    );
  }

  getUsuarioById(idUsuario: string): Observable<Usuario | null> {
    const docRef = this.inContext(() => doc(this.firestore, `usuarios/${idUsuario}`));

    return this.inContext(() => docData(docRef)).pipe(
      take(1),
      map(data => {
        if (!data) {
          return null;
        }

        const usuario = this.normalizeUsuario(data as Usuario);
        return { ...usuario, idUsuario: usuario.idUsuario || idUsuario };
      }),
      catchError(error => {
        console.error('Error obteniendo usuario:', error);
        return throwError(() => new Error('Error al cargar usuario'));
      })
    );
  }

  addUsuario(usuario: Usuario): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `usuarios/${usuario.idUsuario}`));

    return from(this.inContext(() => setDoc(docRef, usuario, { merge: true }))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error agregando usuario:', error);
        return throwError(() => new Error('Error al agregar usuario'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  updateUsuarioEstado(
    idUsuario: string,
    cambios: Partial<Pick<Usuario, 'activo' | 'rol'>>
  ): Observable<void> {
    const campos = Object.keys(cambios);
    const usuarioActual = this.injector.get(AuthService).getCurrentUser();

    if (!usuarioActual || usuarioActual.rol !== 'admin') {
      return throwError(() => new Error('Solo un administrador puede actualizar el estado de usuarios'));
    }

    if (!idUsuario || idUsuario === usuarioActual.idUsuario || !campos.length
      || !campos.every(campo => campo === 'activo' || campo === 'rol')) {
      return throwError(() => new Error('La actualización de usuario no es válida'));
    }

    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `usuarios/${idUsuario}`));

    return from(this.inContext(() => updateDoc(docRef, cambios))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error actualizando estado de usuario:', error);
        return throwError(() => new Error('Error al actualizar el estado del usuario'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  solicitarEliminacionCuenta(idUsuario: string, fechaSolicitudEliminacion: string): Observable<void> {
    if (!idUsuario || !fechaSolicitudEliminacion) {
      return throwError(() => new Error('No se encontró la cuenta para solicitar su eliminación'));
    }

    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `usuarios/${idUsuario}`));
    const solicitud = {
      pendienteEliminacion: true,
      fechaSolicitudEliminacion,
    };

    return from(this.inContext(() => updateDoc(docRef, solicitud))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error solicitando eliminación de cuenta:', error);
        return throwError(() => new Error('No se pudo registrar la solicitud de eliminación'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  registrarDispositivo(idUsuario: string, dispositivo: Dispositivo): Observable<void> {
    if (!idUsuario || !dispositivo.token || !dispositivo.fechaRegistro) {
      return throwError(() => new Error('No se pudo registrar el dispositivo'));
    }

    const docRef = this.inContext(() => doc(this.firestore, `usuarios/${idUsuario}/dispositivos/${dispositivo.token}`));

    return from(this.inContext(() => setDoc(docRef, dispositivo, { merge: true }))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error registrando dispositivo FCM:', error);
        return throwError(() => new Error('No se pudo guardar el token del dispositivo'));
      })
    );
  }

  getComunidadById(idComunidad: string): Observable<Comunidad | null> {
    const docRef = this.inContext(() => doc(this.firestore, `comunidades/${idComunidad}`));

    return this.inContext(() => docData(docRef, { idField: 'idComunidad' })).pipe(
      take(1),
      map(data => data ? data as Comunidad : null),
      catchError(error => {
        console.error('Error obteniendo comunidad:', error);
        return throwError(() => new Error('Error al cargar comunidad'));
      })
    );
  }

  addComunidad(comunidad: Omit<Comunidad, 'idComunidad'>): Observable<string> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() => collection(this.firestore, 'comunidades'));

    return from(this.inContext(() => addDoc(col, { ...comunidad, fechaCreacion: new Date().toISOString() }))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error agregando comunidad:', error);
        return throwError(() => new Error('Error al agregar comunidad'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  updateComunidad(id: string, comunidad: Partial<Comunidad>): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `comunidades/${id}`));

    return from(this.inContext(() => updateDoc(docRef, comunidad))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error actualizando comunidad:', error);
        return throwError(() => new Error('Error al actualizar comunidad'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  // Validar un código de invitación ocurre ANTES de autenticarse (al
  // registrarse, o al unirse con Google desde cero), así que no puede
  // depender de una consulta a "comunidades" protegida por signedIn(): eso
  // producía permission-denied y el mensaje "Error al validar código de
  // invitación" siempre, incluso con un código correcto. En su lugar se lee
  // un documento aparte en "codigos_invitacion" (doc id = el código),
  // público solo para lectura puntual (get, nunca list), que solo contiene
  // el id y nombre de la comunidad — nunca los datos del administrador.
  getComunidadByCodigoInvitacion(codigoInvitacion: string): Observable<{ idComunidad: string; nombreComunidad: string } | null> {
    this.isLoadingSubject.next(true);
    const ref = this.inContext(() => doc(this.firestore, `codigos_invitacion/${codigoInvitacion}`));

    return this.inContext(() => docData(ref)).pipe(
      map(data => data ? { idComunidad: data['comunidadId'] as string, nombreComunidad: data['nombreComunidad'] as string } : null),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo comunidad por código:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al validar código de invitación'));
      })
    );
  }

  // La Cloud Function onComunidadWrite (Admin SDK) debería mantener esto
  // sincronizado sola, pero su trigger de Eventarc quedó sin dispararse
  // pese a varios reintentos y redeploys (posible atasco de plataforma sin
  // diagnóstico posible desde la CLI). El cliente también escribe aquí
  // como respaldo, para no depender de un único mecanismo: si la función
  // llega a funcionar más adelante, ambas escrituras son idénticas y no
  // hay conflicto.
  registrarCodigoInvitacion(codigoInvitacion: string, comunidadId: string, nombreComunidad: string): Observable<void> {
    const ref = this.inContext(() => doc(this.firestore, `codigos_invitacion/${codigoInvitacion}`));

    return from(this.inContext(() => setDoc(ref, { comunidadId, nombreComunidad }))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error registrando código de invitación:', error);
        return throwError(() => new Error('Error al registrar código de invitación'));
      })
    );
  }

  getRecordatoriosByUsuario(idUsuario: string, comunidadId: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'recordatorios');
      // La regla de seguridad de "recordatorios" exige idUsuario Y comunidadId
      // (isMemberOfCommunity). Firestore solo puede validar una consulta de
      // lista cuando TODOS los campos que la regla revisa también están en
      // los filtros de la consulta; si comunidadId no se filtra aquí,
      // Firestore rechaza la lista completa con "Missing or insufficient
      // permissions" aunque los documentos individuales sí cumplirían la
      // regla.
      return query(
        col,
        where('idUsuario', '==', idUsuario),
        where('comunidadId', '==', comunidadId),
        limit(100)
      );
    });

    return this.inContext(() => collectionData(q, { idField: 'idRecordatorios' })).pipe(
      map(data => (data as Array<Recordatorio & Record<string, unknown>>)
        .map(recordatorio => this.normalizeRecordatorio(recordatorio))
        .sort((a, b) => (a.fechaHora || '').localeCompare(b.fechaHora || ''))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo recordatorios:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar recordatorios'));
      })
    );
  }

  getRecordatoriosByComunidad(comunidadId: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'recordatorios');
      return query(col, where('comunidadId', '==', comunidadId), limit(500));
    });

    return this.inContext(() => collectionData(q, { idField: 'idRecordatorios' })).pipe(
      map(data => (data as Array<Recordatorio & Record<string, unknown>>)
        .map(recordatorio => this.normalizeRecordatorio(recordatorio))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo recordatorios de la comunidad:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar recordatorios'));
      })
    );
  }

  addRecordatorio(recordatorio: Omit<Recordatorio, 'idRecordatorios'>): Observable<string> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() => collection(this.firestore, 'recordatorios'));

    return from(this.inContext(() => addDoc(col, { ...recordatorio, fechaCreacion: new Date().toISOString() }))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error agregando recordatorio:', error);
        return throwError(() => new Error('Error al agregar recordatorio'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  updateRecordatorio(id: string, recordatorio: Partial<Recordatorio>): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `recordatorios/${id}`));

    return from(this.inContext(() => updateDoc(docRef, recordatorio))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error actualizando recordatorio:', error);
        return throwError(() => new Error('Error al actualizar recordatorio'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  deleteRecordatorio(id: string): Observable<void> {
    this.isLoadingSubject.next(true);
    const docRef = this.inContext(() => doc(this.firestore, `recordatorios/${id}`));

    return from(this.inContext(() => deleteDoc(docRef))).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error eliminando recordatorio:', error);
        return throwError(() => new Error('Error al eliminar recordatorio'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  private normalizeAviso(data: Aviso & Record<string, unknown>): Aviso {
    return {
      idAviso: data.idAviso,
      tituloAviso: data.tituloAviso || String(data['titulo'] || 'Sin título'),
      descripcionAviso: data.descripcionAviso || String(data['descripcion'] || ''),
      tipoAviso: data.tipoAviso || String(data['tipo'] || 'informativo'),
      fechaPublicacion: data.fechaPublicacion || String(data['fecha'] || ''),
      ubicacionAviso: data.ubicacionAviso || undefined,
      autorId: data.autorId || String(data['autorId'] || ''),
      autorNombre: data.autorNombre || String(data['autorNombre'] || ''),
      comunidadId: data.comunidadId || String(data['comunidadId'] || ''),
      imagen: data.imagen || String(data['imagen'] || ''),
      estado: data.estado,
    };
  }

  private normalizeUsuario(usuario: Usuario): Usuario {
    return { ...usuario, activo: usuario.activo !== false };
  }

  private normalizeRecordatorio(data: Recordatorio & Record<string, unknown>): Recordatorio {
    return {
      idRecordatorios: data.idRecordatorios,
      tituloRecordatorio: data.tituloRecordatorio || String(data['titulo'] || data['tituloRecordatorio'] || 'Recordatorio'),
      descripcionRecordatorio: data.descripcionRecordatorio || String(data['descripcion'] || ''),
      fechaHora: data.fechaHora || String(data['fecha'] || data['fechaHora'] || ''),
      idUsuario: data.idUsuario || String(data['idUsuario'] || ''),
      comunidadId: data.comunidadId || String(data['comunidadId'] || ''),
      fechaCreacion: data.fechaCreacion || String(data['fechaCreacion'] || ''),
      estado: data.estado,
    };
  }
}
