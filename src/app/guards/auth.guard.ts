import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, Observable, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return combineLatest([this.authService.authReady$, this.authService.currentUser$]).pipe(
      filter(([ready]) => ready),
      take(1),
      map(([, user]) => user ? true : this.router.createUrlTree(['/login']))
    );
  }
}
