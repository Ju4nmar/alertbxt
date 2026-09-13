import { Injectable, Injector, NgZone, inject, runInInjectionContext } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';
import { BehaviorSubject, Observable, firstValueFrom, from, throwError } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { Comunidad, Usuario } from '../models';
import { FirestoreService } from './firestore.service';
import { FcmService } from './fcm.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);
  private readonly firestoreService = inject(FirestoreService);
  private readonly fcmService = inject(FcmService);
  private readonly ngZone = inject(NgZone);
  private readonly currentUserSubject = new BehaviorSubject<Usuario | null>(null);
  private readonly authReadySubject = new BehaviorSubject<boolean>(false);

  public readonly currentUser$ = this.currentUserSubject.asObservable();
  public readonly authReady$ = this.authReadySubject.asObservable();

  constructor() {
    this.setupAuthState();
  }

  private inContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }

  private setupAuthState(): void {
    this.inContext(() => onAuthStateChanged(this.auth, firebaseUser => {
      this.ngZone.run(async () => {
        try {
          if (!firebaseUser) {
            this.currentUserSubject.next(null);
            return;
          }

          const userData = await this.loadUserData(firebaseUser.uid);
          this.currentUserSubject.next(userData);
          if (userData) {
            // FCM se inicia solo después de confirmar el perfil autenticado.
            void this.fcmService.iniciarParaUsuario(userData);
          }
        } catch (error) {
          console.error('Error resolviendo sesión:', error);
          this.currentUserSubject.next(null);
        } finally {
          this.authReadySubject.next(true);
        }
      });
    }));
  }

  private loadUserData(uid: string): Promise<Usuario | null> {
    return firstValueFrom(this.firestoreService.getUsuarioById(uid).pipe(take(1)));
  }

  // Una cuenta desactivada puede autenticarse en Firebase Auth (eso no lo
  // bloquean las reglas), pero luego no puede leer avisos ni recordatorios
  // porque isMemberOfCommunity() exige activo == true. Sin este chequeo
  // explícito, el usuario entraba y solo veía listas vacías con errores de
  // permisos silenciosos en la consola, sin ninguna explicación.
  private async rechazarSiCuentaDesactivada(userData: Usuario): Promise<void> {
    if (userData.activo === false) {
      await this.inContext(() => signOut(this.auth));
      throw new Error('cuenta-desactivada');
    }
  }

  login(email: string, password: string): Observable<Usuario> {
    return from(this.inContext(() => signInWithEmailAndPassword(this.auth, email.trim(), password))).pipe(
      switchMap(async result => {
        const userData = await this.loadUserData(result.user.uid);
        if (!userData) {
          await this.inContext(() => signOut(this.auth));
          throw new Error('Usuario no encontrado en la base de datos');
        }

        await this.rechazarSiCuentaDesactivada(userData);
        this.currentUserSubject.next(userData);
        this.authReadySubject.next(true);
        return userData;
      }),
      catchError(error => {
        console.error('Error en login:', error);
        return throwError(() => error);
      })
    );
  }

  register(userData: {
    email: string;
    password: string;
    nombre: string;
    comunidadId?: string;
    telefono: string;
  }): Observable<Usuario> {
    return from(this.inContext(() => createUserWithEmailAndPassword(this.auth, userData.email.trim(), userData.password))).pipe(
      switchMap(async result => {
        const newUser: Usuario = {
          idUsuario: result.user.uid,
          nombre: userData.nombre.trim(),
          correo: userData.email.trim(),
          telefono: userData.telefono.trim(),
          rol: 'residente',
          activo: true,
          comunidadId: userData.comunidadId || '',
          fechaRegistro: new Date().toISOString(),
        };

        await firstValueFrom(this.firestoreService.addUsuario(newUser));
        this.currentUserSubject.next(newUser);
        this.authReadySubject.next(true);
        return newUser;
      }),
      catchError(error => {
        console.error('Error en registro:', error);
        return throwError(() => error);
      })
    );
  }

  registerAdminAndCreateComunidad(data: {
    nombreComunidad: string;
    administradorNombre: string;
    administradorCorreo: string;
    administradorCelular: string;
    contrasena: string;
    aceptaTerminos: boolean;
  }): Observable<{ comunidad: Comunidad; usuario: Usuario }> {
    if (!data.aceptaTerminos) {
      return throwError(() => new Error('Debe aceptar los términos y condiciones'));
    }

    return from(this.inContext(() => createUserWithEmailAndPassword(this.auth, data.administradorCorreo.trim(), data.contrasena))).pipe(
      switchMap(async result => {
        const codigoInvitacion = this.generateCodigoInvitacion();
        const comunidadData: Omit<Comunidad, 'idComunidad'> = {
          nombreComunidad: data.nombreComunidad.trim(),
          administradorNombre: data.administradorNombre.trim(),
          administradorCorreo: data.administradorCorreo.trim(),
          administradorCelular: data.administradorCelular.trim(),
          codigoInvitacion,
          fechaCreacion: new Date().toISOString(),
        };

        const comunidadId = await firstValueFrom(this.firestoreService.addComunidad(comunidadData));
        const newUser: Usuario = {
          idUsuario: result.user.uid,
          nombre: data.administradorNombre.trim(),
          correo: data.administradorCorreo.trim(),
          telefono: data.administradorCelular.trim(),
          rol: 'admin',
          activo: true,
          comunidadId,
          fechaRegistro: new Date().toISOString(),
        };

        await firstValueFrom(this.firestoreService.addUsuario(newUser));
        this.currentUserSubject.next(newUser);
        this.authReadySubject.next(true);

        return {
          comunidad: { ...comunidadData, idComunidad: comunidadId },
          usuario: newUser,
        };
      }),
      catchError(error => {
        console.error('Error en registro y creacion de comunidad:', error);
        return throwError(() => error);
      })
    );
  }

  loginWithGoogle(): Observable<Usuario> {
    return from(this.inContext(() => signInWithPopup(this.auth, new GoogleAuthProvider()))).pipe(
      switchMap(async result => {
        const userData = await this.loadUserData(result.user.uid);
        if (!userData) {
          await this.inContext(() => signOut(this.auth));
          throw new Error('No existe una cuenta con este usuario de Google. Regístrate o únete con un código de invitación.');
        }

        await this.rechazarSiCuentaDesactivada(userData);
        this.currentUserSubject.next(userData);
        this.authReadySubject.next(true);
        return userData;
      }),
      catchError(error => {
        console.error('Error en login con Google:', error);
        return throwError(() => error);
      })
    );
  }

  joinComunidadWithGoogle(codigoInvitacion: string): Observable<{ comunidad: Comunidad; usuario: Usuario }> {
    const codigo = codigoInvitacion.trim().toUpperCase();

    return this.firestoreService.getComunidadByCodigoInvitacion(codigo).pipe(
      take(1),
      switchMap(comunidad => {
        if (!comunidad?.idComunidad) {
          throw new Error('Código de invitación inválido');
        }

        return from(this.inContext(() => signInWithPopup(this.auth, new GoogleAuthProvider()))).pipe(
          switchMap(async result => {
            const existente = await this.loadUserData(result.user.uid);

            if (existente) {
              if (existente.comunidadId && existente.comunidadId !== comunidad.idComunidad) {
                throw new Error('Esta cuenta de Google ya pertenece a otra vecindad');
              }

              const usuarioActualizado: Usuario = { ...existente, comunidadId: comunidad.idComunidad || '' };
              await firstValueFrom(this.firestoreService.addUsuario(usuarioActualizado));
              this.currentUserSubject.next(usuarioActualizado);
              this.authReadySubject.next(true);
              return { comunidad, usuario: usuarioActualizado };
            }

            const nuevoUsuario: Usuario = {
              idUsuario: result.user.uid,
              nombre: result.user.displayName || 'Residente',
              correo: result.user.email || '',
              telefono: '',
              rol: 'residente',
              activo: true,
              comunidadId: comunidad.idComunidad || '',
              fechaRegistro: new Date().toISOString(),
            };

            await firstValueFrom(this.firestoreService.addUsuario(nuevoUsuario));
            this.currentUserSubject.next(nuevoUsuario);
            this.authReadySubject.next(true);
            return { comunidad, usuario: nuevoUsuario };
          })
        );
      }),
      catchError(error => {
        console.error('Error uniéndose con Google:', error);
        return throwError(() => error);
      })
    );
  }

  logout(): Observable<void> {
    return from(this.inContext(() => signOut(this.auth))).pipe(
      map(() => {
        this.currentUserSubject.next(null);
        this.fcmService.detener();
        this.authReadySubject.next(true);
      }),
      catchError(error => {
        console.error('Error en logout:', error);
        return throwError(() => new Error('Error al cerrar sesión'));
      })
    );
  }

  getCurrentUser(): Usuario | null {
    return this.currentUserSubject.value;
  }

  setCurrentUser(user: Usuario): void {
    this.currentUserSubject.next(user);
  }

  // La baja física de Authentication y Firestore debe ejecutarla un administrador
  // o una Cloud Function/proceso administrativo posterior; nunca desde el cliente.
  solicitarEliminacionCuenta(): Observable<void> {
    const usuarioActual = this.getCurrentUser();

    if (!usuarioActual?.idUsuario) {
      return throwError(() => new Error('Usuario no autenticado'));
    }

    if (usuarioActual.pendienteEliminacion) {
      return throwError(() => new Error('Ya existe una solicitud de eliminación para esta cuenta'));
    }

    const fechaSolicitudEliminacion = new Date().toISOString();
    return this.firestoreService.solicitarEliminacionCuenta(usuarioActual.idUsuario, fechaSolicitudEliminacion).pipe(
      map(() => {
        this.currentUserSubject.next({
          ...usuarioActual,
          pendienteEliminacion: true,
          fechaSolicitudEliminacion,
        });
      })
    );
  }

  joinComunidad(codigoInvitacion: string): Observable<{ comunidad: Comunidad; usuario: Usuario }> {
    return this.firestoreService.getComunidadByCodigoInvitacion(codigoInvitacion.trim().toUpperCase()).pipe(
      take(1),
      switchMap(comunidad => {
        if (!comunidad) {
          throw new Error('Código de invitación inválido');
        }

        const currentUser = this.getCurrentUser();
        if (!currentUser) {
          throw new Error('Usuario no autenticado');
        }

        if (currentUser.comunidadId && currentUser.comunidadId !== comunidad.idComunidad) {
          throw new Error('El usuario ya pertenece a otra vecindad');
        }

        const updatedUser: Usuario = {
          ...currentUser,
          rol: currentUser.rol,
          comunidadId: comunidad.idComunidad || '',
        };

        return this.firestoreService.addUsuario(updatedUser).pipe(
          map(() => {
            this.currentUserSubject.next(updatedUser);
            return { comunidad, usuario: updatedUser };
          })
        );
      }),
      catchError(error => {
        console.error('Error uniendose a comunidad:', error);
        return throwError(() => error);
      })
    );
  }

  registerResidentAndJoinComunidad(data: {
    nombre: string;
    correo: string;
    telefono: string;
    numeroApartamento: string;
    password: string;
    codigoInvitacion: string;
  }): Observable<{ comunidad: Comunidad; usuario: Usuario }> {
    const codigoInvitacion = data.codigoInvitacion.trim().toUpperCase();

    return this.firestoreService.getComunidadByCodigoInvitacion(codigoInvitacion).pipe(
      take(1),
      switchMap(comunidad => {
        if (!comunidad?.idComunidad) {
          throw new Error('Código de invitación inválido');
        }

        return from(this.inContext(() => createUserWithEmailAndPassword(this.auth, data.correo.trim(), data.password))).pipe(
          switchMap(async result => {
            const newUser: Usuario = {
              idUsuario: result.user.uid,
              nombre: data.nombre.trim(),
              correo: data.correo.trim(),
              telefono: data.telefono.trim(),
              numeroApartamento: data.numeroApartamento.trim(),
              rol: 'residente',
              activo: true,
              comunidadId: comunidad.idComunidad || '',
              fechaRegistro: new Date().toISOString(),
            };

            await firstValueFrom(this.firestoreService.addUsuario(newUser));
            this.currentUserSubject.next(newUser);
            this.authReadySubject.next(true);
            return { comunidad, usuario: newUser };
          })
        );
      }),
      catchError(error => {
        console.error('Error registrando residente:', error);
        return throwError(() => error);
      })
    );
  }

  private generateCodigoInvitacion(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  }
}
