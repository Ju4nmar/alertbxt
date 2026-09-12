import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, Observable, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Evita que un usuario ya autenticado vea las pantallas públicas de acceso
 * (login, registro, recuperar contraseña). Sin este guard, visitar esas
 * rutas con sesión iniciada renderiza el shell autenticado (header, menú,
 * botón SOS) superpuesto con la pantalla pública.
 */
@Injectable({
  providedIn: 'root',
})
export class GuestGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return combineLatest([this.authService.authReady$, this.authService.currentUser$]).pipe(
      filter(([ready]) => ready),
      take(1),
      map(([, user]) => user ? this.router.createUrlTree(['/alertas-eventos']) : true)
    );
  }
}
