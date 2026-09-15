import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';

// Envuelve las funciones sueltas del SDK de Firebase Auth para que
// AuthService quede desacoplado de ellas y sea posible sustituirlas por
// spies en pruebas unitarias (mismo patrón que MessagingClientService para
// @angular/fire/messaging).
@Injectable({ providedIn: 'root' })
export class AuthClientService {
  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);

  private inContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return this.inContext(() => onAuthStateChanged(this.auth, callback));
  }

  signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    return this.inContext(() => signInWithEmailAndPassword(this.auth, email, password));
  }

  signInWithGoogle(): Promise<UserCredential> {
    return this.inContext(() => signInWithPopup(this.auth, new GoogleAuthProvider()));
  }

  createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    return this.inContext(() => createUserWithEmailAndPassword(this.auth, email, password));
  }

  signOut(): Promise<void> {
    return this.inContext(() => signOut(this.auth));
  }
}
