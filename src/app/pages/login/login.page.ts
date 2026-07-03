import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonInput, IonButton, IonItem, IonHeader, IonToolbar, IonTitle } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem, IonHeader, IonToolbar, IonTitle],
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  isLoading = false;
  loginError = '';

  async login(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.loginError = '';
    const email = this.email.trim();

    if (!email || !this.password) {
      this.loginError = 'Ingresa tu correo y contrasena.';
      return;
    }

    if (!this.isValidEmail(email) || email.length > 120 || this.password.length < 6 || this.password.length > 40) {
      this.loginError = 'Revisa el correo y la contrasena.';
      return;
    }

    this.isLoading = true;
    try {
      const user = await firstValueFrom(this.authService.login(email, this.password));
      this.router.navigate([user.comunidadId ? '/alertas-eventos' : '/unirse-vecindad']);
    } catch (error) {
      console.error('Error de inicio de sesion:', error);
      this.loginError = this.getLoginErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  goToRegistro(): void {
    this.router.navigate(['/registro']);
  }

  goToUnirseVecindad(): void {
    this.router.navigate(['/unirse-vecindad']);
  }

  goToForgotPassword(): void {
    this.router.navigate(['/forgot-password']);
  }

  private getLoginErrorMessage(error: unknown): string {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Correo o contrasena incorrectos.';
    }

    if (code === 'auth/too-many-requests') {
      return 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.';
    }

    if (code === 'auth/invalid-email') {
      return 'El formato del correo no es valido.';
    }

    return 'No se pudo iniciar sesion. Revisa tus datos e intenta nuevamente.';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
