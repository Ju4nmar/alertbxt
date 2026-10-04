import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  DocumentData,
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  limit,
  orderBy,
  Query,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { BehaviorSubject, Observable, combineLatest, forkJoin, from, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, take, tap } from 'rxjs/operators';
import { Aviso, Comunidad, Dispositivo, Encuesta, Reserva, Vehiculo, ZonaComun, MensajeAdmin, MensajeEnviado, Recordatorio, RespuestaMensaje, TipoComunidad, Usuario } from '../models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  private readonly injector = inject(Injector);
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly isLoadingSubject = new BehaviorSubject<boolean>(false);
  public readonly isLoading$ = this.isLoadingSubject.asObservable();

  private inContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }

  // Las reglas no filtran: si el arrendatario consultara todos los avisos de
  // la comunidad, Firestore rechazaría la consulta completa por poder incluir
  // alguno "solo propietarios". Por eso su consulta lo declara explícitamente
  // (y por eso todo aviso guarda soloPropietarios como booleano).
  getAvisosByComunidad(comunidadId: string, rol?: string): Observable<Aviso[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'avisos');
      const filtros = [where('comunidadId', '==', comunidadId)];
      if (rol === 'arrendatario') {
        filtros.push(where('soloPropietarios', '==', false));
      }
      return query(col, ...filtros, limit(50));
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

    return from(this.inContext(() => addDoc(col, {
      ...aviso,
      soloPropietarios: aviso.soloPropietarios === true,
      fechaPublicacion: new Date().toISOString(),
    }))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error agregando aviso:', error);
        return throwError(() => new Error('Error al agregar aviso'));
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  // Avisos creados antes de existir "solo propietarios" no tienen el campo y
  // quedarían fuera de la consulta del arrendatario; un admin los completa.
  completarSoloPropietarios(avisos: Aviso[]): Observable<void[]> {
    const pendientes = avisos.filter(aviso => !!aviso.idAviso && aviso.soloPropietarios === undefined);
    if (pendientes.length === 0) {
      return of([]);
    }
    return forkJoin(pendientes.map(aviso => this.updateAviso(aviso.idAviso as string, { soloPropietarios: false })));
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
  getComunidadByCodigoInvitacion(codigoInvitacion: string): Observable<{ idComunidad: string; nombreComunidad: string; tipoComunidad?: TipoComunidad } | null> {
    this.isLoadingSubject.next(true);
    const ref = this.inContext(() => doc(this.firestore, `codigos_invitacion/${codigoInvitacion}`));

    return this.inContext(() => docData(ref)).pipe(
      map(data => data ? {
        idComunidad: data['comunidadId'] as string,
        nombreComunidad: data['nombreComunidad'] as string,
        tipoComunidad: data['tipoComunidad'] as TipoComunidad | undefined,
      } : null),
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
  registrarCodigoInvitacion(codigoInvitacion: string, comunidadId: string, nombreComunidad: string, tipoComunidad?: TipoComunidad): Observable<void> {
    const ref = this.inContext(() => doc(this.firestore, `codigos_invitacion/${codigoInvitacion}`));
    const data: Record<string, unknown> = { comunidadId, nombreComunidad };
    if (tipoComunidad) {
      data['tipoComunidad'] = tipoComunidad;
    }

    return from(this.inContext(() => setDoc(ref, data))).pipe(
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

  // Recordatorios de grupo que un admin asignó puntualmente a este usuario
  // (usuariosAsignados array-contains uid) — un solo documento compartido
  // con otros destinatarios, no una copia propia. Ver getRecordatoriosByUsuario
  // sobre por qué comunidadId también se filtra aquí.
  getRecordatoriosAsignadosByUsuario(idUsuario: string, comunidadId: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'recordatorios');
      return query(
        col,
        where('usuariosAsignados', 'array-contains', idUsuario),
        where('comunidadId', '==', comunidadId),
        limit(100)
      );
    });

    return this.inContext(() => collectionData(q, { idField: 'idRecordatorios' })).pipe(
      map(data => (data as Array<Recordatorio & Record<string, unknown>>)
        .map(recordatorio => this.normalizeRecordatorio(recordatorio))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo recordatorios asignados:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar recordatorios asignados'));
      })
    );
  }

  // Recordatorios que un admin asignó a toda la comunidad (paraTodaLaComunidad).
  getRecordatoriosParaTodaLaComunidad(comunidadId: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, 'recordatorios');
      return query(
        col,
        where('comunidadId', '==', comunidadId),
        where('paraTodaLaComunidad', '==', true),
        limit(100)
      );
    });

    return this.inContext(() => collectionData(q, { idField: 'idRecordatorios' })).pipe(
      map(data => (data as Array<Recordatorio & Record<string, unknown>>)
        .map(recordatorio => this.normalizeRecordatorio(recordatorio))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo recordatorios de la comunidad:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar recordatorios de la comunidad'));
      })
    );
  }

  // Todo lo que un usuario debe ver como "sus" recordatorios: los personales,
  // los que un admin le asignó (o asignó a toda la comunidad) y, si es admin,
  // los que él mismo asignó a otros — así conserva el registro de que
  // llegaron y de si ya se cumplieron. Son consultas separadas (una por
  // regla de seguridad) que se unen aquí, sin repetidos.
  getRecordatoriosVisibles(usuario: Usuario): Observable<Recordatorio[]> {
    const idUsuario = usuario.idUsuario || '';
    const fuentes = [
      this.getRecordatoriosByUsuario(idUsuario, usuario.comunidadId),
      this.getRecordatoriosAsignadosByUsuario(idUsuario, usuario.comunidadId),
      this.getRecordatoriosParaTodaLaComunidad(usuario.comunidadId),
    ];
    if (usuario.rol === 'admin') {
      fuentes.push(this.getRecordatoriosCreadosPor(idUsuario, usuario.comunidadId));
    }

    return combineLatest(fuentes).pipe(
      map(listas => {
        const porId = new Map<string, Recordatorio>();
        ([] as Recordatorio[]).concat(...listas).forEach(recordatorio => {
          porId.set(recordatorio.idRecordatorios || `${recordatorio.fechaHora}-${recordatorio.tituloRecordatorio}`, recordatorio);
        });
        return Array.from(porId.values()).sort((a, b) => (a.fechaHora || '').localeCompare(b.fechaHora || ''));
      })
    );
  }

  // Recordatorios de grupo que este admin creó (autorId).
  getRecordatoriosCreadosPor(autorId: string, comunidadId: string): Observable<Recordatorio[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => query(
      collection(this.firestore, 'recordatorios'),
      where('autorId', '==', autorId),
      where('comunidadId', '==', comunidadId),
      limit(100)
    ));

    return this.inContext(() => collectionData(q, { idField: 'idRecordatorios' })).pipe(
      map(data => (data as Array<Recordatorio & Record<string, unknown>>)
        .map(recordatorio => this.normalizeRecordatorio(recordatorio))
      ),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo recordatorios creados:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar recordatorios creados'));
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

  // A diferencia de addRecordatorio (escritura directa del cliente, para
  // recordatorios personales), esto pasa por una Cloud Function porque
  // valida que quien asigna es admin y que los destinatarios pertenecen a
  // su comunidad — la misma razón por la que enviarMensajeIndividual no es
  // un simple addDoc.
  crearRecordatorioAsignado(datos: {
    titulo: string;
    descripcion: string;
    fechaHora: string;
    usuarioIds?: string[];
    paraTodos?: boolean;
  }): Observable<void> {
    const crear = httpsCallable<typeof datos, { recordatorioId: string }>(this.functions, 'crearRecordatorioAsignado');

    return from(crear(datos)).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error creando recordatorio asignado:', error);
        const mensaje = (error as { message?: string })?.message;
        return throwError(() => new Error(mensaje || 'No se pudo crear el recordatorio.'));
      })
    );
  }

  getMensajesAdminByUsuario(idUsuario: string): Observable<MensajeAdmin[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, `usuarios/${idUsuario}/mensajes_admin`);
      return query(col, orderBy('fecha', 'desc'), limit(100));
    });

    return this.inContext(() => collectionData(q, { idField: 'idMensaje' })).pipe(
      map(data => data as MensajeAdmin[]),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo mensajes:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar mensajes'));
      })
    );
  }

  getMensajesEnviadosByUsuario(idUsuario: string): Observable<MensajeEnviado[]> {
    this.isLoadingSubject.next(true);
    const q = this.inContext(() => {
      const col = collection(this.firestore, `usuarios/${idUsuario}/mensajes_enviados`);
      return query(col, orderBy('fecha', 'desc'), limit(100));
    });

    return this.inContext(() => collectionData(q, { idField: 'idMensaje' })).pipe(
      map(data => data as MensajeEnviado[]),
      tap(() => this.isLoadingSubject.next(false)),
      catchError(error => {
        console.error('Error obteniendo mensajes enviados:', error);
        this.isLoadingSubject.next(false);
        return throwError(() => new Error('Error al cargar mensajes enviados'));
      })
    );
  }

  getRespuestasMensaje(idUsuarioDueno: string, mensajeId: string): Observable<RespuestaMensaje[]> {
    const q = this.inContext(() => {
      const col = collection(this.firestore, `usuarios/${idUsuarioDueno}/mensajes_admin/${mensajeId}/respuestas`);
      return query(col, orderBy('fecha', 'asc'));
    });

    return this.inContext(() => collectionData(q, { idField: 'idRespuesta' })).pipe(
      map(data => data as RespuestaMensaje[]),
      catchError(error => {
        console.error('Error obteniendo respuestas del mensaje:', error);
        return throwError(() => new Error('Error al cargar las respuestas'));
      })
    );
  }

  // Igual que con los avisos: el arrendatario debe declarar
  // soloPropietarios == false en su consulta (ver getAvisosByComunidad).
  getEncuestasByComunidad(comunidadId: string, rol?: string): Observable<Encuesta[]> {
    const q = this.inContext(() => {
      const filtros = [where('comunidadId', '==', comunidadId)];
      if (rol === 'arrendatario') {
        filtros.push(where('soloPropietarios', '==', false));
      }
      return query(collection(this.firestore, 'encuestas'), ...filtros, limit(100));
    });

    return this.inContext(() => collectionData(q, { idField: 'idEncuesta' })).pipe(
      map(data => (data as Array<Record<string, unknown>>)
        .map(encuesta => this.normalizeEncuesta(encuesta))
        .sort((a, b) => b.cierre.localeCompare(a.cierre))
      ),
      catchError(error => {
        console.error('Error obteniendo encuestas:', error);
        return throwError(() => new Error('Error al cargar encuestas'));
      })
    );
  }

  addEncuesta(encuesta: Omit<Encuesta, 'idEncuesta' | 'conteo' | 'totalVotos' | 'fechaCreacion'>): Observable<string> {
    const col = this.inContext(() => collection(this.firestore, 'encuestas'));
    const datos = {
      ...encuesta,
      cierre: Timestamp.fromDate(new Date(encuesta.cierre)),
      fechaCreacion: new Date().toISOString(),
      conteo: {},
      totalVotos: 0,
    };

    return from(this.inContext(() => addDoc(col, datos))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error creando encuesta:', error);
        return throwError(() => new Error('Error al crear la encuesta'));
      })
    );
  }

  cerrarEncuesta(id: string): Observable<void> {
    const docRef = this.inContext(() => doc(this.firestore, `encuestas/${id}`));
    return from(this.inContext(() => updateDoc(docRef, { cierre: Timestamp.now() }))).pipe(
      catchError(error => {
        console.error('Error cerrando encuesta:', error);
        return throwError(() => new Error('Error al cerrar la encuesta'));
      })
    );
  }

  deleteEncuesta(id: string): Observable<void> {
    const docRef = this.inContext(() => doc(this.firestore, `encuestas/${id}`));
    return from(this.inContext(() => deleteDoc(docRef))).pipe(
      catchError(error => {
        console.error('Error eliminando encuesta:', error);
        return throwError(() => new Error('Error al eliminar la encuesta'));
      })
    );
  }

  // Opción que eligió este usuario (null si aún no vota). El id del voto es
  // el uid: de ahí sale que solo se pueda votar una vez.
  getMiVoto(encuestaId: string, uid: string): Observable<number | null> {
    const docRef = this.inContext(() => doc(this.firestore, `encuestas/${encuestaId}/votos/${uid}`));
    return this.inContext(() => docData(docRef)).pipe(
      take(1),
      map(data => (data && typeof data['opcion'] === 'number') ? data['opcion'] as number : null),
      catchError(() => of(null))
    );
  }

  votarEncuesta(encuestaId: string, uid: string, opcion: number): Observable<void> {
    const docRef = this.inContext(() => doc(this.firestore, `encuestas/${encuestaId}/votos/${uid}`));
    return from(this.inContext(() => setDoc(docRef, { opcion, fecha: new Date().toISOString() }))).pipe(
      catchError(error => {
        console.error('Error registrando voto:', error);
        return throwError(() => new Error('Error al registrar el voto'));
      })
    );
  }

  private normalizeEncuesta(data: Record<string, unknown>): Encuesta {
    const cierre = data['cierre'] as { toDate?: () => Date } | string | undefined;
    const cierreIso = typeof cierre === 'string'
      ? cierre
      : (cierre?.toDate ? cierre.toDate().toISOString() : new Date(0).toISOString());
    return {
      idEncuesta: data['idEncuesta'] as string,
      titulo: String(data['titulo'] || 'Sin título'),
      descripcion: (data['descripcion'] as string | undefined) || undefined,
      opciones: Array.isArray(data['opciones']) ? data['opciones'] as string[] : [],
      comunidadId: String(data['comunidadId'] || ''),
      autorId: String(data['autorId'] || ''),
      autorNombre: (data['autorNombre'] as string | undefined) || undefined,
      soloPropietarios: data['soloPropietarios'] === true,
      cierre: cierreIso,
      fechaCreacion: data['fechaCreacion'] as string | undefined,
      conteo: (data['conteo'] as Record<string, number> | undefined) ?? {},
      totalVotos: typeof data['totalVotos'] === 'number' ? data['totalVotos'] as number : 0,
    };
  }

  // Los vecinos solo leen sus propios vehículos (la regla lo exige, así que
  // la consulta también filtra por dueño); admin y guarda leen toda la comunidad.
  getVehiculosDeUsuario(idUsuario: string, comunidadId: string): Observable<Vehiculo[]> {
    const q = this.inContext(() => query(
      collection(this.firestore, 'vehiculos'),
      where('propietarioId', '==', idUsuario),
      where('comunidadId', '==', comunidadId),
      limit(20)
    ));
    return this.vehiculosDesde(q);
  }

  getVehiculosDeComunidad(comunidadId: string): Observable<Vehiculo[]> {
    const q = this.inContext(() => query(
      collection(this.firestore, 'vehiculos'),
      where('comunidadId', '==', comunidadId),
      limit(500)
    ));
    return this.vehiculosDesde(q);
  }

  addVehiculo(vehiculo: Omit<Vehiculo, 'idVehiculo' | 'fechaRegistro'>): Observable<string> {
    const id = `${vehiculo.comunidadId}_${vehiculo.placa}`;
    const docRef = this.inContext(() => doc(this.firestore, `vehiculos/${id}`));
    const datos: Record<string, unknown> = { ...vehiculo, fechaRegistro: new Date().toISOString() };
    Object.keys(datos).forEach(clave => datos[clave] === undefined && delete datos[clave]);

    return from(this.inContext(() => setDoc(docRef, datos))).pipe(
      map(() => id),
      catchError(error => {
        console.error('Error registrando vehículo:', error);
        return throwError(() => error);
      })
    );
  }

  deleteVehiculo(id: string): Observable<void> {
    const docRef = this.inContext(() => doc(this.firestore, `vehiculos/${id}`));
    return from(this.inContext(() => deleteDoc(docRef))).pipe(
      catchError(error => {
        console.error('Error eliminando vehículo:', error);
        return throwError(() => new Error('Error al eliminar el vehículo'));
      })
    );
  }

  private vehiculosDesde(q: Query<DocumentData>): Observable<Vehiculo[]> {
    return this.inContext(() => collectionData(q, { idField: 'idVehiculo' })).pipe(
      map(data => (data as unknown as Vehiculo[]).sort((a, b) => a.placa.localeCompare(b.placa))),
      catchError(error => {
        console.error('Error obteniendo vehículos:', error);
        return throwError(() => new Error('Error al cargar vehículos'));
      })
    );
  }

  getZonasByComunidad(comunidadId: string): Observable<ZonaComun[]> {
    const q = this.inContext(() => query(
      collection(this.firestore, 'zonas'),
      where('comunidadId', '==', comunidadId),
      limit(50)
    ));
    return this.inContext(() => collectionData(q, { idField: 'idZona' })).pipe(
      map(data => (data as unknown as ZonaComun[]).sort((a, b) => a.nombre.localeCompare(b.nombre))),
      catchError(error => {
        console.error('Error obteniendo zonas comunes:', error);
        return throwError(() => new Error('Error al cargar las zonas comunes'));
      })
    );
  }

  addZona(zona: Omit<ZonaComun, 'idZona'>): Observable<string> {
    const col = this.inContext(() => collection(this.firestore, 'zonas'));
    return from(this.inContext(() => addDoc(col, zona))).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error creando zona común:', error);
        return throwError(() => new Error('Error al crear la zona'));
      })
    );
  }

  deleteZona(id: string): Observable<void> {
    const docRef = this.inContext(() => doc(this.firestore, `zonas/${id}`));
    return from(this.inContext(() => deleteDoc(docRef))).pipe(
      catchError(error => {
        console.error('Error eliminando zona común:', error);
        return throwError(() => new Error('Error al eliminar la zona'));
      })
    );
  }

  // Ocupación de una zona en un día (para pintar los bloques libres y ocupados).
  getReservasDeZonaYFecha(comunidadId: string, zonaId: string, fecha: string): Observable<Reserva[]> {
    return this.reservasDesde(this.inContext(() => query(
      collection(this.firestore, 'reservas'),
      where('comunidadId', '==', comunidadId),
      where('zonaId', '==', zonaId),
      where('fecha', '==', fecha),
      limit(48)
    )));
  }

  getReservasDeUsuario(idUsuario: string, comunidadId: string): Observable<Reserva[]> {
    return this.reservasDesde(this.inContext(() => query(
      collection(this.firestore, 'reservas'),
      where('usuarioId', '==', idUsuario),
      where('comunidadId', '==', comunidadId),
      limit(200)
    )));
  }

  getReservasDeComunidad(comunidadId: string): Observable<Reserva[]> {
    return this.reservasDesde(this.inContext(() => query(
      collection(this.firestore, 'reservas'),
      where('comunidadId', '==', comunidadId),
      limit(500)
    )));
  }

  // Todos los bloques en un solo lote: si alguno ya fue tomado por otro
  // vecino, Firestore rechaza el lote completo y no queda reservado ninguno.
  crearReservas(reservas: Array<Omit<Reserva, 'idReserva' | 'inicio'> & { id: string; inicio: Date }>): Observable<void> {
    const batch = this.inContext(() => writeBatch(this.firestore));
    reservas.forEach(({ id, inicio, ...datos }) => {
      const limpio: Record<string, unknown> = { ...datos, inicio: Timestamp.fromDate(inicio) };
      Object.keys(limpio).forEach(clave => limpio[clave] === undefined && delete limpio[clave]);
      batch.set(this.inContext(() => doc(this.firestore, `reservas/${id}`)), limpio);
    });
    return from(this.inContext(() => batch.commit())).pipe(
      catchError(error => {
        console.error('Error creando reservas:', error);
        return throwError(() => error);
      })
    );
  }

  cancelarReservas(ids: string[]): Observable<void> {
    const batch = this.inContext(() => writeBatch(this.firestore));
    ids.forEach(id => batch.delete(this.inContext(() => doc(this.firestore, `reservas/${id}`))));
    return from(this.inContext(() => batch.commit())).pipe(
      catchError(error => {
        console.error('Error cancelando reservas:', error);
        return throwError(() => new Error('Error al cancelar la reserva'));
      })
    );
  }

  private reservasDesde(q: Query<DocumentData>): Observable<Reserva[]> {
    return this.inContext(() => collectionData(q, { idField: 'idReserva' })).pipe(
      map(data => (data as Array<Record<string, unknown>>).map(reserva => {
        const inicio = reserva['inicio'] as { toDate?: () => Date } | string | undefined;
        return {
          ...reserva,
          inicio: typeof inicio === 'string' ? inicio : (inicio?.toDate ? inicio.toDate().toISOString() : ''),
        } as unknown as Reserva;
      })),
      catchError(error => {
        console.error('Error obteniendo reservas:', error);
        return throwError(() => new Error('Error al cargar reservas'));
      })
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
      latitud: data.latitud,
      longitud: data.longitud,
      precisionMetros: data.precisionMetros,
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
      idUsuario: data.idUsuario || undefined,
      usuariosAsignados: data.usuariosAsignados,
      paraTodaLaComunidad: data.paraTodaLaComunidad,
      autorId: data.autorId,
      comunidadId: data.comunidadId || String(data['comunidadId'] || ''),
      fechaCreacion: data.fechaCreacion || String(data['fechaCreacion'] || ''),
      estado: data.estado,
    };
  }
}
