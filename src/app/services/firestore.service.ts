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
import { Aviso, Comunidad, Recordatorio, Usuario } from '../models';

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

  getUsuarios(): Observable<Usuario[]> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() => collection(this.firestore, 'usuarios'));

    return this.inContext(() => collectionData(col)).pipe(
      map(data => data as Usuario[]),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo usuarios:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar usuarios'));
      })
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
      map(data => data as Usuario[]),
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
      switchMap(data => {
        if (data) {
          const usuario = data as Usuario;
          return of({ ...usuario, idUsuario: usuario.idUsuario || idUsuario });
        }

        return this.getUsuarioByCampoId(idUsuario).pipe(
          take(1),
          switchMap(usuario => {
            if (!usuario) {
              return of(null);
            }

            const usuarioNormalizado: Usuario = { ...usuario, idUsuario };
            return this.addUsuario(usuarioNormalizado).pipe(
              map(() => usuarioNormalizado),
              catchError(() => of(usuarioNormalizado))
            );
          })
        );
      }),
      catchError(error => {
        console.error('Error obteniendo usuario:', error);
        return throwError(() => new Error('Error al cargar usuario'));
      })
    );
  }

  private getUsuarioByCampoId(idUsuario: string): Observable<Usuario | null> {
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'usuarios');
      return query(col, where('idUsuario', '==', idUsuario), limit(1));
    });

    return this.inContext(() => collectionData(q)).pipe(
      map(data => data.length ? data[0] as Usuario : null)
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

  getComunidades(): Observable<Comunidad[]> {
    this.isLoadingSubject.next(true);
    const col = this.inContext(() => collection(this.firestore, 'comunidades'));

    return this.inContext(() => collectionData(col, { idField: 'idComunidad' })).pipe(
      map(data => data as Comunidad[]),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo comunidades:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar comunidades'));
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

  getComunidadByCodigoInvitacion(codigoInvitacion: string): Observable<Comunidad | null> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'comunidades');
      return query(col, where('codigoInvitacion', '==', codigoInvitacion), limit(1));
    });

    return this.inContext(() => collectionData(q, { idField: 'idComunidad' })).pipe(
      map(data => data.length > 0 ? data[0] as Comunidad : null),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo comunidad por codigo:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al validar codigo de invitacion'));
      })
    );
  }

  getRecordatoriosByUsuario(idUsuario: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'recordatorios');
      return query(
        col,
        where('idUsuario', '==', idUsuario),
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

  getAvisosByNeighborhood(neighborhoodId: string): Observable<Aviso[]> {
    return this.getAvisosByComunidad(neighborhoodId);
  }

  getUsers(): Observable<Usuario[]> {
    return this.getUsuarios();
  }

  addUser(usuario: Usuario): Observable<void> {
    return this.addUsuario(usuario);
  }

  getNeighborhoods(): Observable<Comunidad[]> {
    return this.getComunidades();
  }

  addNeighborhood(comunidad: Omit<Comunidad, 'idComunidad'>): Observable<string> {
    return this.addComunidad(comunidad);
  }

  getNeighborhoodByInviteCode(inviteCode: string): Observable<Comunidad | null> {
    return this.getComunidadByCodigoInvitacion(inviteCode);
  }

  private normalizeAviso(data: Aviso & Record<string, unknown>): Aviso {
    return {
      idAviso: data.idAviso,
      tituloAviso: data.tituloAviso || String(data['titulo'] || 'Sin titulo'),
      descripcionAviso: data.descripcionAviso || String(data['descripcion'] || ''),
      tipoAviso: data.tipoAviso || String(data['tipo'] || 'informativo'),
      fechaPublicacion: data.fechaPublicacion || String(data['fecha'] || ''),
      autorId: data.autorId || String(data['autorId'] || ''),
      autorNombre: data.autorNombre || String(data['autorNombre'] || ''),
      comunidadId: data.comunidadId || String(data['comunidadId'] || ''),
      imagen: data.imagen || String(data['imagen'] || ''),
    };
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
    };
  }
}
