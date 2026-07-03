import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, Observable, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class RoleGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const requiredRole = route.data['role'] as 'admin' | 'residente';

    return combineLatest([this.authService.authReady$, this.authService.currentUser$]).pipe(
      filter(([ready]) => ready),
      take(1),
      map(([, user]) => user?.rol === requiredRole ? true : this.router.createUrlTree(['/alertas-eventos']))
    );
  }
}
