import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem } from '@ionic/angular/standalone';
import { getFirebaseErrorCode, isValidEmail } from '../../utils/auth-form.utils';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem],
})
export class ForgotPasswordPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  email = '';
  isLoading = false;
  resetError = '';
  resetSuccess = '';

  async resetPassword(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.resetError = '';
    this.resetSuccess = '';
    const email = this.email.trim();

    if (!email) {
      this.resetError = 'Ingresa tu correo electrónico.';
      return;
    }

    if (!isValidEmail(email) || email.length > 120) {
      this.resetError = 'Ingresa un correo válido.';
      return;
    }

    this.isLoading = true;
    try {
      await sendPasswordResetEmail(this.auth, email);
      this.resetSuccess = 'Se envió un enlace de recuperación a tu correo.';
    } catch (error) {
      console.error('Error enviando enlace:', error);
      this.resetError = this.getResetErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  private getResetErrorMessage(error: unknown): string {
    const code = getFirebaseErrorCode(error);

    if (code === 'auth/invalid-email') {
      return 'El correo no tiene un formato válido.';
    }

    if (code === 'auth/user-not-found') {
      return 'No encontramos una cuenta con ese correo.';
    }

    return 'No se pudo enviar el enlace. Intenta nuevamente.';
  }
}
