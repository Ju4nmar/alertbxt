import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonInput, IonButton, IonItem } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { getFirebaseErrorCode, isValidEmail } from '../../utils/auth-form.utils';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem],
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  isLoading = false;
  isGoogleLoading = false;
  loginError = '';

  async loginWithGoogle(): Promise<void> {
    if (this.isLoading || this.isGoogleLoading) {
      return;
    }

    this.loginError = '';
    this.isGoogleLoading = true;
    try {
      const user = await firstValueFrom(this.authService.loginWithGoogle());
      this.router.navigate([user.comunidadId ? '/alertas-eventos' : '/unirse-vecindad']);
    } catch (error) {
      console.error('Error de inicio de sesión con Google:', error);
      this.loginError = this.getGoogleErrorMessage(error);
    } finally {
      this.isGoogleLoading = false;
    }
  }

  async login(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.loginError = '';
    const email = this.email.trim();

    if (!email || !this.password) {
      this.loginError = 'Ingresa tu correo y contraseña.';
      return;
    }

    if (!isValidEmail(email) || email.length > 120 || this.password.length < 6 || this.password.length > 40) {
      this.loginError = 'Revisa el correo y la contraseña.';
      return;
    }

    this.isLoading = true;
    try {
      const user = await firstValueFrom(this.authService.login(email, this.password));
      this.router.navigate([user.comunidadId ? '/alertas-eventos' : '/unirse-vecindad']);
    } catch (error) {
      console.error('Error de inicio de sesión:', error);
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
    if (error instanceof Error && error.message === 'cuenta-desactivada') {
      return 'Tu cuenta ha sido desactivada. Contacta a un administrador de tu conjunto.';
    }

    const code = getFirebaseErrorCode(error);

    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Correo o contraseña incorrectos.';
    }

    if (code === 'auth/too-many-requests') {
      return 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.';
    }

    if (code === 'auth/invalid-email') {
      return 'El formato del correo no es válido.';
    }

    return 'No se pudo iniciar sesión. Revisa tus datos e inténtalo nuevamente.';
  }

  private getGoogleErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message === 'cuenta-desactivada') {
      return 'Tu cuenta ha sido desactivada. Contacta a un administrador de tu conjunto.';
    }

    const code = getFirebaseErrorCode(error);

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return '';
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
  }
}
